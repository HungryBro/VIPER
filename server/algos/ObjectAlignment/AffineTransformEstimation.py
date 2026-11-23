# server/algos/ObjectAlignment/AffineTransformEstimation.py
import cv2
import numpy as np
import json
import os
from typing import Dict, Any

from server.cache_utils import config_hash, load_cached_json
from server.utils_io import OUT, ensure_dirs, locate_file, read_json


def run(
    match_json_path: str, 
    out_root: str, 
    model: str = "affine", 
    warp_mode: str = "image2_to_image1", 
    blend: bool = False,
    ransac_thresh: float = 3.0,
    confidence: float = 0.99,
    refine_iters: int = 10
):
    real_match_json = locate_file(match_json_path)
    data = read_json(real_match_json)

    if "matching_tool" not in data:
        raise ValueError("Invalid input: Input file is not a Matcher result.")

    details = data.get("input_features_details", {})
    img1_info = details.get("image1", {})
    img2_info = details.get("image2", {})

    raw_path1 = img1_info.get("original_path") or img1_info.get("file_name")
    raw_path2 = img2_info.get("original_path") or img2_info.get("file_name")

    path1 = locate_file(raw_path1)
    path2 = locate_file(raw_path2)

    if not path1 or not os.path.exists(path1):
        raise FileNotFoundError(f"Cannot find image 1: {raw_path1} (Resolved: {path1})")
    if not path2 or not os.path.exists(path2):
        raise FileNotFoundError(f"Cannot find image 2: {raw_path2} (Resolved: {path2})")

    img1 = cv2.imread(path1)
    img2 = cv2.imread(path2)
    
    if img1 is None: raise FileNotFoundError(f"Cannot read image1: {path1}")
    if img2 is None: raise FileNotFoundError(f"Cannot read image2: {path2}")

    matched_points = data.get("matched_points", [])
    if not matched_points:
         raise ValueError("JSON missing 'matched_points'. Please re-run Matcher node.")

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

    if len(src_pts) < 3:
        raise ValueError(f"Not enough points for Affine (need 3+, found {len(src_pts)})")

    src_pts = np.float32(src_pts).reshape(-1, 1, 2)
    dst_pts = np.float32(dst_pts).reshape(-1, 1, 2)

    method = cv2.RANSAC
    if model == "partial":
        M, inliers_mask = cv2.estimateAffinePartial2D(
            src_pts, dst_pts, 
            method=method, 
            ransacReprojThreshold=ransac_thresh, 
            confidence=confidence,
            refineIters=refine_iters
        )
        tool_used = "AffinePartial2D"
    else:
        M, inliers_mask = cv2.estimateAffine2D(
            src_pts, dst_pts, 
            method=method, 
            ransacReprojThreshold=ransac_thresh, 
            confidence=confidence,
            refineIters=refine_iters
        )
        tool_used = "Affine2D"

    inliers_count = int(inliers_mask.sum()) if inliers_mask is not None else 0

    if M is None:
         raise ValueError(f"Affine estimation failed ({tool_used}). Try adjusting RANSAC threshold.")

    if out_root is None:
        out_root = OUT
        
    out_dir = os.path.join(out_root, "features", "affine_outputs")
    ensure_dirs(out_dir)
    
    t_match = os.path.getmtime(real_match_json) if os.path.exists(real_match_json) else 0
    t_img1 = os.path.getmtime(path1) if os.path.exists(path1) else 0
    t_img2 = os.path.getmtime(path2) if os.path.exists(path2) else 0

    config_map = {
        "match_json": os.path.basename(match_json_path),
        "tm": t_match,
        "ti1": t_img1,
        "ti2": t_img2,
        "model": model,
        "warp": warp_mode,
        "blend": blend,
        "ransac": ransac_thresh,
        "conf": confidence,
        "iters": refine_iters
    }
    param_hash = config_hash(config_map)
    
    base_match = os.path.splitext(os.path.basename(match_json_path))[0]
    stem = f"affine_{base_match}_{param_hash}"
    
    out_img_name = f"{stem}.jpg"
    out_json_name = f"{stem}.json"
    
    out_img_path = os.path.join(out_dir, out_img_name)
    out_json_path = os.path.join(out_dir, out_json_name)

    cached = load_cached_json(out_json_path, out_img_path)
    if cached is not None:
        cached["json_path"] = out_json_path
        return cached

    h, w = target_img.shape[:2]
    aligned = cv2.warpAffine(source_img, M, (w, h))

    if blend:
        if aligned.shape[:2] != target_img.shape[:2]:
             aligned = cv2.resize(aligned, (target_img.shape[1], target_img.shape[0]))
        aligned = cv2.addWeighted(target_img, 0.5, aligned, 0.5, 0)

    cv2.imwrite(out_img_path, aligned)
    vis_url = f"/static/features/affine_outputs/{out_img_name}"

    result = {
        "tool": "AffineAlignment",
        "model": model,
        "warp_mode": warp_mode,
        "blend": blend,
        "num_inliers": inliers_count,
        "affine_matrix": M.tolist(),
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