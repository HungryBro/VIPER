import os
import json
import cv2
import numpy as np
import pytest
from pathlib import Path

from server.algos.ObjectAlignment.homography_alignment_adapter import run as homo_run

# 1. FIXTURES

@pytest.fixture(autouse=True)
def chdir_tmp(tmp_path, monkeypatch):
    """เปลี่ยน Working Directory ไปที่ tmp_path เพื่อไม่ให้ Output ไปกวนโปรเจกต์จริง"""
    monkeypatch.chdir(tmp_path)
    yield

@pytest.fixture
def img_pair(tmp_path):
    """สร้างรูปภาพจำลอง 2 รูป ขนาดเท่ากัน (100x100)"""
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
def img_pair_diff_size(tmp_path):
    """สร้างรูปภาพ 2 รูปที่มี 'ขนาดต่างกัน' เพื่อทดสอบ Resize Logic"""
    img1_path = tmp_path / "small.jpg"
    img2_path = tmp_path / "big.jpg"
    
    cv2.imwrite(str(img1_path), np.zeros((100, 100, 3), dtype=np.uint8))
    cv2.imwrite(str(img2_path), np.zeros((200, 200, 3), dtype=np.uint8))
    
    return str(img1_path), str(img2_path)

@pytest.fixture
def match_json(tmp_path, img_pair):
    """สร้างไฟล์ JSON จำลองผลลัพธ์จากการ Matching (Good Case)"""
    img1_path, img2_path = img_pair
    json_path = tmp_path / "match_result.json"
    
    points = [
        {"pt1": [20.0, 20.0], "pt2": [30.0, 30.0]},
        {"pt1": [80.0, 20.0], "pt2": [90.0, 30.0]},
        {"pt1": [80.0, 80.0], "pt2": [90.0, 90.0]},
        {"pt1": [20.0, 80.0], "pt2": [30.0, 90.0]},
        {"pt1": [50.0, 50.0], "pt2": [60.0, 60.0]} 
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

# 2. FUNCTIONAL TESTS (Happy Paths)

def test_homography_basic_run(tmp_path, match_json):
    """ทดสอบการทำงานพื้นฐาน (Default Parameters)"""
    out = homo_run(match_json, out_root=str(tmp_path))
    
    assert out["tool"] == "HomographyAlignment"
    assert "homography_matrix" in out
    assert out["num_inliers"] > 0
    assert os.path.exists(out["output"]["aligned_image"])

def test_warp_mode_switching(tmp_path, match_json):
    """ทดสอบการสลับ Warp Mode (Image1 -> Image2)"""
    out1 = homo_run(match_json, out_root=str(tmp_path), warp_mode="image2_to_image1")
    assert out1["warp_mode"] == "image2_to_image1"
    
    out2 = homo_run(match_json, out_root=str(tmp_path), warp_mode="image1_to_image2")
    assert out2["warp_mode"] == "image1_to_image2"
    
    H1 = np.array(out1["homography_matrix"])
    H2 = np.array(out2["homography_matrix"])
    assert not np.allclose(H1, H2, atol=1e-5)

def test_unknown_warp_mode_fallback(tmp_path, match_json):
    """ทดสอบกรณีใส่ Warp Mode มั่วๆ ระบบควร Fallback ไปใช้ Default logic (ไม่ Crash)"""
    out = homo_run(match_json, out_root=str(tmp_path), warp_mode="UNKNOWN_MODE")
    
    assert os.path.exists(out["output"]["aligned_image"])
    assert out["warp_mode"] == "UNKNOWN_MODE"

def test_blend_mode(tmp_path, match_json):
    """ทดสอบโหมด Blend (Overlay)"""
    out = homo_run(match_json, out_root=str(tmp_path), blend=True)
    assert out["blend"] is True
    assert os.path.exists(out["output"]["aligned_image"])

def test_different_image_sizes_blend(tmp_path, img_pair_diff_size):
    """ทดสอบการ Blend ภาพที่ขนาดไม่เท่ากัน (ต้องมีการ Resize อัตโนมัติ)"""
    p1, p2 = img_pair_diff_size
    json_path = tmp_path / "diff_size.json"
    
    points = [
        {"pt1": [0,0], "pt2": [0,0]},
        {"pt1": [100,0], "pt2": [200,0]},
        {"pt1": [100,100], "pt2": [200,200]},
        {"pt1": [0,100], "pt2": [0,200]}
    ]
    
    data = {
        "matching_tool": "BFMatcher",
        "input_features_details": {
            "image1": {"original_path": p1}, 
            "image2": {"original_path": p2} 
        },
        "matched_points": points
    }
    with open(json_path, "w") as f: json.dump(data, f)
    
    out = homo_run(str(json_path), out_root=str(tmp_path), blend=True)
    assert os.path.exists(out["output"]["aligned_image"])

def test_output_matrix_shape(tmp_path, match_json):
    """ตรวจสอบว่า Homography Matrix เป็น 3x3"""
    out = homo_run(match_json, out_root=str(tmp_path))
    H = out["homography_matrix"]
    assert len(H) == 3
    assert len(H[0]) == 3
    assert isinstance(H[2][2], float)

# 3. ERROR HANDLING & ROBUSTNESS

def test_missing_match_json_raises(tmp_path):
    """ไฟล์ Input ไม่มีจริง"""
    with pytest.raises(FileNotFoundError):
        homo_run("ghost.json", out_root=str(tmp_path))

def test_invalid_input_not_matcher_result(tmp_path):
    """ไฟล์ Input เป็น JSON อื่นที่ไม่ใช่ผลลัพธ์ Matcher"""
    fake_json = tmp_path / "fake.json"
    with open(fake_json, "w") as f: json.dump({"foo": "bar"}, f)
    
    with pytest.raises(ValueError, match="Invalid input"):
        homo_run(str(fake_json), out_root=str(tmp_path))

def test_missing_matched_points_key(tmp_path, match_json):
    """ไฟล์ JSON ขาดคีย์ matched_points"""
    with open(match_json, "r") as f: data = json.load(f)
    del data["matched_points"]
    
    bad_json = tmp_path / "no_key.json"
    with open(bad_json, "w") as f: json.dump(data, f)
    
    with pytest.raises(ValueError, match="missing 'matched_points'"):
        homo_run(str(bad_json), out_root=str(tmp_path))

def test_empty_matched_points_list(tmp_path, match_json):
    """คีย์ matched_points มี แต่เป็น List ว่าง []"""
    with open(match_json, "r") as f: data = json.load(f)
    data["matched_points"] = []
    
    bad_json = tmp_path / "empty_list.json"
    with open(bad_json, "w") as f: json.dump(data, f)
    
    with pytest.raises(ValueError, match="missing 'matched_points'"):
        homo_run(str(bad_json), out_root=str(tmp_path))

def test_not_enough_points(tmp_path, match_json):
    """มีจุดคู่แมตช์น้อยกว่า 4 จุด (คำนวณ Homography ไม่ได้)"""
    with open(match_json, "r") as f: data = json.load(f)
    data["matched_points"] = data["matched_points"][:3] 
    
    bad_json = tmp_path / "few_points.json"
    with open(bad_json, "w") as f: json.dump(data, f)
    
    with pytest.raises(ValueError, match="Not enough points"):
        homo_run(str(bad_json), out_root=str(tmp_path))

def test_missing_source_images(tmp_path, match_json):
    """ไฟล์รูปต้นฉบับถูกลบไปแล้ว"""
    with open(match_json, "r") as f: data = json.load(f)
    data["input_features_details"]["image1"]["original_path"] = str(tmp_path / "deleted.jpg")
    
    bad_json = tmp_path / "img_404.json"
    with open(bad_json, "w") as f: json.dump(data, f)
    
    with pytest.raises(FileNotFoundError):
        homo_run(str(bad_json), out_root=str(tmp_path))

def test_degenerate_points_homography_fail(tmp_path, match_json):
    """จุด 4 จุดเรียงอยู่บนเส้นตรงเดียวกัน (Degenerate Case -> findHomography returns None)"""
    with open(match_json, "r") as f: data = json.load(f)
    
    linear_points = []
    for i in range(4):
        linear_points.append({
            "pt1": [float(i*10), 10.0], 
            "pt2": [float(i*10), 10.0]
        })
    data["matched_points"] = linear_points
    
    bad_json = tmp_path / "linear_points.json"
    with open(bad_json, "w") as f: json.dump(data, f)
    
    with pytest.raises(RuntimeError, match="Cannot compute homography"):
        homo_run(str(bad_json), out_root=str(tmp_path))

# 4. CACHING & I/O

def test_caching_same_input_returns_same_file(tmp_path, match_json):
    """รันซ้ำด้วย Input เดิม ต้องได้ Output Path เดิม (Cache Hit)"""
    out1 = homo_run(match_json, out_root=str(tmp_path))
    out2 = homo_run(match_json, out_root=str(tmp_path))
    assert out1["json_path"] == out2["json_path"]

def test_param_change_creates_new_file(tmp_path, match_json):
    """เปลี่ยน Parameter (Blend) ต้องได้ไฟล์ใหม่"""
    out1 = homo_run(match_json, out_root=str(tmp_path), blend=False)
    out2 = homo_run(match_json, out_root=str(tmp_path), blend=True)
    assert out1["json_path"] != out2["json_path"]

def test_static_path_resolution(tmp_path, monkeypatch):
    """ทดสอบ logic การแปลง path ที่ขึ้นต้นด้วย /static/"""
    fake_root = tmp_path / "project"
    fake_root.mkdir()
    monkeypatch.setattr("server.utils_io.OUT", str(fake_root / "outputs"))
    
    (fake_root / "outputs").mkdir()
    real_file = fake_root / "outputs" / "test.jpg"
    with open(real_file, "w") as f: f.write("fake image content")
    
    from server import utils_io as mod
    resolved = mod.locate_file("/static/test.jpg")
    
    assert resolved == str(real_file)