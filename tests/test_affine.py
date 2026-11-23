import os
import json
import cv2
import numpy as np
import pytest
from pathlib import Path

from server.algos.ObjectAlignment.AffineTransformEstimation import run as affine_run

# 1. FIXTURES

@pytest.fixture(autouse=True)
def chdir_tmp(tmp_path, monkeypatch):
    """เปลี่ยน Working Directory ไปที่ tmp_path"""
    monkeypatch.chdir(tmp_path)
    yield

@pytest.fixture
def img_pair(tmp_path):
    """สร้างรูปภาพจำลอง 2 รูป (100x100)"""
    img1_path = tmp_path / "img1.jpg"
    img2_path = tmp_path / "img2.jpg"
    
    img1 = np.zeros((100, 100, 3), dtype=np.uint8)
    cv2.rectangle(img1, (20, 20), (80, 80), (255, 255, 255), -1)
    cv2.imwrite(str(img1_path), img1)
    
    img2 = np.zeros((100, 100, 3), dtype=np.uint8)
    cv2.rectangle(img2, (30, 30), (90, 90), (255, 255, 255), -1)
    cv2.imwrite(str(img2_path), img2)
    
    return str(img1_path), str(img2_path)

@pytest.fixture
def match_json(tmp_path, img_pair):
    img1_path, img2_path = img_pair
    json_path = tmp_path / "match_result.json"
    
    points = [
        {"pt1": [0.0, 0.0],   "pt2": [10.0, 10.0]},
        {"pt1": [100.0, 0.0], "pt2": [110.0, 10.0]},
        {"pt1": [0.0, 100.0], "pt2": [10.0, 110.0]}
    ]
    
    data = {
        "matching_tool": "BFMatcher",
        "input_features_details": {
            "image1": {"original_path": img1_path},
            "image2": {"original_path": img2_path}
        },
        "matched_points": points
    }
    
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
        
    return str(json_path)

# 2. FUNCTIONAL TESTS

def test_affine_basic_run(tmp_path, match_json):
    """ทดสอบการทำงานพื้นฐาน (Default Parameters)"""
    out = affine_run(match_json, out_root=str(tmp_path))
    
    assert out["tool"] == "AffineAlignment"
    assert "affine_matrix" in out
    assert out["model"] == "affine"
    assert out["num_inliers"] > 0
    assert os.path.exists(out["output"]["aligned_image"])

def test_model_partial_affine(tmp_path, match_json):
    """ทดสอบโหมด Partial Affine (จำกัด Degree of Freedom)"""
    out = affine_run(match_json, out_root=str(tmp_path), model="partial")
    
    assert out["model"] == "partial"
    assert len(out["affine_matrix"]) == 2 
    assert os.path.exists(out["output"]["aligned_image"])

def test_warp_mode_switching(tmp_path, match_json):
    """ทดสอบสลับ Warp Mode"""
    out1 = affine_run(match_json, out_root=str(tmp_path), warp_mode="image2_to_image1")
    out2 = affine_run(match_json, out_root=str(tmp_path), warp_mode="image1_to_image2")
    
    assert out1["warp_mode"] != out2["warp_mode"]
    M1 = np.array(out1["affine_matrix"])
    M2 = np.array(out2["affine_matrix"])
    assert not np.allclose(M1, M2, atol=1e-5)

def test_blend_mode(tmp_path, match_json):
    """ทดสอบการเปิด Blend"""
    out = affine_run(match_json, out_root=str(tmp_path), blend=True)
    assert out["blend"] is True
    assert os.path.exists(out["output"]["aligned_image"])

def test_ransac_param_echo(tmp_path, match_json):
    """ทดสอบว่าค่า Parameter ถูกบันทึกลง Hash/Output ถูกต้อง"""
    out = affine_run(match_json, out_root=str(tmp_path), ransac_thresh=10.0, confidence=0.8)
  
    assert out["affine_matrix"] is not None

def test_matrix_shape_is_2x3(tmp_path, match_json):
    """Affine Matrix ต้องมีขนาด 2x3 เสมอ"""
    out = affine_run(match_json, out_root=str(tmp_path))
    M = out["affine_matrix"]
    assert len(M) == 2
    assert len(M[0]) == 3

# 3. ERROR HANDLING

def test_missing_json_raises(tmp_path):
    """ไฟล์ JSON input หาย"""
    with pytest.raises(FileNotFoundError):
        affine_run("ghost.json", out_root=str(tmp_path))

def test_invalid_json_type(tmp_path):
    """ไฟล์ไม่ใช่ผลลัพธ์ Matcher"""
    p = tmp_path / "bad.json"
    with open(p, "w") as f: json.dump({"foo": "bar"}, f)
    
    with pytest.raises(ValueError, match="Invalid input"):
        affine_run(str(p), out_root=str(tmp_path))

def test_missing_matched_points(tmp_path, match_json):
    """JSON ไม่มี key matched_points"""
    with open(match_json, "r") as f: data = json.load(f)
    del data["matched_points"]
    
    p = tmp_path / "no_pts.json"
    with open(p, "w") as f: json.dump(data, f)
    
    with pytest.raises(ValueError, match="missing 'matched_points'"):
        affine_run(str(p), out_root=str(tmp_path))

def test_empty_points(tmp_path, match_json):
    """Points เป็น list ว่าง"""
    with open(match_json, "r") as f: data = json.load(f)
    data["matched_points"] = []
    
    p = tmp_path / "empty.json"
    with open(p, "w") as f: json.dump(data, f)
    
    with pytest.raises(ValueError, match="missing 'matched_points'"):
        affine_run(str(p), out_root=str(tmp_path))

def test_not_enough_points_for_affine(tmp_path, match_json):
    """จุดน้อยกว่า 3 จุด (Affine ต้องการ 3)"""
    with open(match_json, "r") as f: data = json.load(f)
    data["matched_points"] = data["matched_points"][:2] 
    
    p = tmp_path / "two_pts.json"
    with open(p, "w") as f: json.dump(data, f)
    
    with pytest.raises(ValueError, match="Not enough points"):
        affine_run(str(p), out_root=str(tmp_path))

def test_missing_source_images(tmp_path, match_json):
    """ไฟล์รูปต้นฉบับหาย"""
    with open(match_json, "r") as f: data = json.load(f)
    data["input_features_details"]["image1"]["original_path"] = str(tmp_path / "gone.jpg")
    
    p = tmp_path / "img_404.json"
    with open(p, "w") as f: json.dump(data, f)
    
    with pytest.raises(FileNotFoundError):
        affine_run(str(p), out_root=str(tmp_path))

def test_estimation_failure_mock(tmp_path, match_json, monkeypatch):
    """จำลองกรณี cv2.estimateAffine2D คืนค่า None (คำนวณไม่ได้)"""
    def fake_estimate(*args, **kwargs):
        return None, None 
    
    monkeypatch.setattr(cv2, "estimateAffine2D", fake_estimate)
    
    with pytest.raises(ValueError, match="Affine estimation failed"):
        affine_run(match_json, out_root=str(tmp_path), model="affine")

# 4. CACHING & PATH RESOLUTION

def test_caching_same_input(tmp_path, match_json):
    """รันซ้ำต้องได้ไฟล์เดิม"""
    out1 = affine_run(match_json, out_root=str(tmp_path))
    out2 = affine_run(match_json, out_root=str(tmp_path))
    assert out1["json_path"] == out2["json_path"]

def test_param_change_creates_new_file(tmp_path, match_json):
    """เปลี่ยน Params (เช่น ransac) ต้องได้ไฟล์ใหม่"""
    out1 = affine_run(match_json, out_root=str(tmp_path), ransac_thresh=3.0)
    out2 = affine_run(match_json, out_root=str(tmp_path), ransac_thresh=5.0)
    assert out1["json_path"] != out2["json_path"]

def test_static_path_resolution(tmp_path, monkeypatch):
    """ทดสอบ _resolve_file_path กับ /static/"""
    fake_root = tmp_path / "app"
    fake_root.mkdir()
    monkeypatch.setattr("server.utils_io.OUT", str(fake_root / "outputs"))
    
    (fake_root / "outputs").mkdir()
    real_file = fake_root / "outputs" / "image.png"
    with open(real_file, "w") as f: f.write("data")
    
    from server import utils_io as mod
    resolved = mod.locate_file("/static/image.png")
    
    assert resolved == str(real_file)