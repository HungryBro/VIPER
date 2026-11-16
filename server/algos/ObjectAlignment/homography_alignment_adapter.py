# server/algos/ObjectAlignment/homography_alignment_adapter.py
import cv2
import numpy as np
import json
import os
from typing import Dict, Any

from server.cache_utils import config_hash, load_cached_json
from server.utils_io import OUT, locate_file, read_json


def run(
    match_json_path: str, 
    out_root: str, 
    warp_mode: str = "image2_to_image1", 
    blend: bool = False
):
    real_match_json = locate_file(match_json_path)
    data = read_json(real_match_json)

    if "matching_tool" not in data:
        raise ValueError("Invalid input: Not a Matcher result.")

    details = data.get("input_features_details", {})
    img1_info = details.get("image1", {})
    img2_info = details.get("image2", {})

    path1 = locate_file(img1_info.get("original_path") or img1_info.get("file_name"))
    path2 = locate_file(img2_info.get("original_path") or img2_info.get("file_name"))

    if not path1 or not os.path.exists(path1): raise FileNotFoundError(f"Image 1 not found")
    if not path2 or not os.path.exists(path2): raise FileNotFoundError(f"Image 2 not found")

    img1 = cv2.imread(path1)
    img2 = cv2.imread(path2)
    
    matched_points = data.get("matched_points", [])
    if not matched_points:
         raise ValueError("JSON missing 'matched_points'. Please Re-Run Matcher Node.")

    src_pts = []
    dst_pts = []
    target_img = None
    source_img = None
    
    for mp in matched_points:
        pt1 = mp["pt1"]
        pt2 = mp["pt2"]
        if warp_mode == "image2_to_image1":
            src_pts.append(pt2); dst_pts.append(pt1)
            target_img = img1; source_img = img2
        else:
            src_pts.append(pt1); dst_pts.append(pt2)
            target_img = img2; source_img = img1

    if len(src_pts) < 4:
        raise ValueError(f"Not enough points (found {len(src_pts)})")

    src_pts = np.float32(src_pts).reshape(-1, 1, 2)
    dst_pts = np.float32(dst_pts).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    inliers_count = int(mask.sum()) if mask is not None else 0
    if H is None: raise RuntimeError("Cannot compute homography.")

    if out_root is None:
        out_root = OUT
    
    out_dir = os.path.join(out_root, "features", "homography_outputs")
    os.makedirs(out_dir, exist_ok=True)

    t_match = os.path.getmtime(real_match_json) if os.path.exists(real_match_json) else 0
    t_img1 = os.path.getmtime(path1) if os.path.exists(path1) else 0
    t_img2 = os.path.getmtime(path2) if os.path.exists(path2) else 0

    config_map = {
        "match_json": os.path.basename(match_json_path),
        "tm": t_match,
        "ti1": t_img1,
        "ti2": t_img2,
        "warp": warp_mode,
        "blend": blend
    }
    param_hash = config_hash(config_map)
    
    base_match = os.path.splitext(os.path.basename(match_json_path))[0]
    stem = f"homo_{base_match}_{param_hash}"
    
    out_img_name = f"{stem}.jpg"
    out_json_name = f"{stem}.json"
    
    out_img_path = os.path.join(out_dir, out_img_name)
    out_json_path = os.path.join(out_dir, out_json_name)

    cached = load_cached_json(out_json_path, out_img_path)
    if cached is not None:
        print(f"⚡ [Homography] Cache Hit: {out_img_name}")
        cached["json_path"] = out_json_path
        return cached

    print(f"⚙️ [Homography] Computing New Result...")
    h_target, w_target = target_img.shape[:2]
    aligned = cv2.warpPerspective(source_img, H, (w_target, h_target))
    
    if blend:
        if aligned.shape[:2] != target_img.shape[:2]:
             aligned = cv2.resize(aligned, (w_target, h_target))
        aligned = cv2.addWeighted(target_img, 0.5, aligned, 0.5, 0)

    cv2.imwrite(out_img_path, aligned)
    vis_url = f"/static/features/homography_outputs/{out_img_name}"

    result = {
        "tool": "HomographyAlignment",
        "warp_mode": warp_mode,
        "blend": blend,
        "num_inliers": inliers_count,
        "homography_matrix": H.tolist(),
        "output": {
            "aligned_image": out_img_path,
            "aligned_url": vis_url,
            "result_image_url": vis_url
        },
        "parameters_hash": config_map
    }

    with open(out_json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        
    result["json_path"] = out_json_path
    return result