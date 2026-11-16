# server/algos/quality/ssim_adapter.py

import os
import cv2
import json
import sys
import numpy as np
from typing import Any, Dict, Tuple, Optional

import skimage.metrics

from server.algos.inputs import image_input
from server.cache_utils import config_hash, load_cached_json
from server.utils_io import OUT


def is_color(img: np.ndarray) -> bool:
    return (img.ndim == 3) and (img.shape[2] in (3, 4))


def _drop_alpha(img: np.ndarray) -> np.ndarray:
    if img is None or img.ndim != 3:
        return img
    if img.shape[2] == 4:
        return img[:, :, :3]
    return img


def _auto_data_range(img1: np.ndarray, img2: np.ndarray) -> float:
    if np.issubdtype(img1.dtype, np.floating) or np.issubdtype(img2.dtype, np.floating):
        mn = float(min(img1.min(), img2.min()))
        mx = float(max(img1.max(), img2.max()))
        if 0.0 <= mn and mx <= 1.0:
            return 1.0
        return max(1e-12, mx - mn)
    if img1.dtype == np.uint16 or img2.dtype == np.uint16:
        return 65535.0
    return 255.0


def _ensure_valid_win_size(h: int, w: int, win_size: int | None) -> int:
    limit = max(3, min(h, w))
    ws = min(win_size, limit) if win_size is not None else min(11, limit)
    if ws % 2 == 0:
        ws = max(3, ws - 1)
    return ws


def _serialize(
    original_image_path: str,
    processed_image_path: str,
    ssim_score: float,
    params_used: Dict[str, Any],
    color_mode_used: str,
    message: str,
    is_color_input: bool,
    config_hash: dict 
) -> Dict[str, Any]:
    try:
        import skimage
        skimage_version = skimage.__version__
    except Exception:
        skimage_version = "N/A"

    return {
        "tool": "SSIM",
        "tool_info": {
            "scikit_image": skimage_version,
            "opencv": cv2.__version__,
            "python": sys.version.split()[0]
        },
        "images": {
            "original": {
                "file_name": os.path.basename(original_image_path),
                "path": original_image_path
            },
            "processed": {
                "file_name": os.path.basename(processed_image_path),
                "path": processed_image_path
            }
        },
        "params_used": params_used,
        "color_mode_used_for_ssim": color_mode_used,
        "score": round(float(ssim_score), 6),
        "score_interpretation": "Higher score (closer to 1.0) indicates better structural similarity.",
        "message": message,
        "is_color_input": is_color_input,
        "parameters_hash": config_hash
    }


def run_ssim_assessment(
    original_img_path: str,
    processed_img_path: str,
    *,
    calculate_on_color: bool = False,
    auto_switch: bool = True,
    **ssim_params
) -> Tuple[float, str, str, bool]:
    
    original_img_raw = cv2.imread(original_img_path, cv2.IMREAD_UNCHANGED)
    processed_img_raw = cv2.imread(processed_img_path, cv2.IMREAD_UNCHANGED)

    if original_img_raw is None or processed_img_raw is None:
        raise FileNotFoundError("Could not load one or both images.")

    original_img = _drop_alpha(original_img_raw)
    processed_img = _drop_alpha(processed_img_raw)

    both_color = is_color(original_img) and is_color(processed_img) and \
                 (original_img.shape[2] == processed_img.shape[2] == 3)

    if auto_switch and both_color:
        calculate_on_color = True

    color_mode_used = "Color (Multi-channel)" if calculate_on_color and both_color else "Grayscale"

    if color_mode_used == "Color (Multi-channel)":
        img1, img2 = original_img, processed_img
        ssim_params["channel_axis"] = -1
    else:
        img1 = cv2.cvtColor(original_img, cv2.COLOR_BGR2GRAY) if is_color(original_img) else original_img
        img2 = cv2.cvtColor(processed_img, cv2.COLOR_BGR2GRAY) if is_color(processed_img) else processed_img

    if img1.shape != img2.shape:
        raise ValueError(f"Image shape mismatch: {img1.shape} vs {img2.shape}")

    if "data_range" not in ssim_params or ssim_params["data_range"] is None:
        ssim_params["data_range"] = _auto_data_range(img1, img2)

    h, w = img1.shape[:2]
    ssim_params["win_size"] = _ensure_valid_win_size(h, w, ssim_params.get("win_size", None))

    if ssim_params.get("gaussian_weights", False) and ("sigma" not in ssim_params or ssim_params["sigma"] is None):
        ssim_params["sigma"] = 1.5

    try:
        ssim_score = skimage.metrics.structural_similarity(img1, img2, **ssim_params)
        message = "SSIM calculation successful."
    except Exception as e:
        raise RuntimeError(f"SSIM calculation failed: {e}")

    is_color_input = is_color(original_img_raw) and is_color(processed_img_raw)
    return float(ssim_score), color_mode_used, message, is_color_input


def compute_ssim(
    original_file: str,
    processed_file: str,
    *,
    out_root: str | None = None,
    calculate_on_color: bool = False,
    auto_switch: bool = True,
    **override_params
) -> Dict[str, Any]:
    
    real_orig_path = image_input(original_file, "SSIM", accept_features=True)
    real_proc_path = image_input(processed_file, "SSIM", accept_features=True)

    ssim_parameters: Dict[str, Any] = {
        "data_range": None,         
        "win_size": 11,              
        "gaussian_weights": True,
        "sigma": 1.5,
        "use_sample_covariance": True,
        "K1": 0.01,
        "K2": 0.03,
    }
    ssim_parameters.update(override_params or {})

    score, color_mode, message, is_color_input = run_ssim_assessment(
        real_orig_path,
        real_proc_path,
        calculate_on_color=calculate_on_color,
        auto_switch=auto_switch,
        **ssim_parameters
    )

    params_for_json = dict(ssim_parameters)
    if params_for_json.get("data_range") is None:
       
        img1 = _drop_alpha(cv2.imread(real_orig_path, cv2.IMREAD_UNCHANGED))
        img2 = _drop_alpha(cv2.imread(real_proc_path, cv2.IMREAD_UNCHANGED))
        if color_mode == "Grayscale":
            img1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY) if is_color(img1) else img1
            img2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY) if is_color(img2) else img2
        params_for_json["data_range"] = float(_auto_data_range(img1, img2))

    config_map = {
        "img1": os.path.basename(real_orig_path),
        "img2": os.path.basename(real_proc_path),
        "color": calculate_on_color,
        "auto": auto_switch,
        "params": ssim_parameters
    }
    param_hash = config_hash(config_map)
    
    json_result = _serialize(
        real_orig_path,
        real_proc_path,
        score,
        params_for_json,
        color_mode,
        message,
        is_color_input,
        config_map
    )

    if out_root is None:
        out_root = OUT

    out_dir = os.path.join(out_root, "features", "ssim_outputs")
    os.makedirs(out_dir, exist_ok=True)

    stem_a = os.path.splitext(os.path.basename(real_orig_path))[0]
    stem_b = os.path.splitext(os.path.basename(real_proc_path))[0]

    json_path = os.path.join(out_dir, f"ssim_{stem_a}_vs_{stem_b}_{param_hash}.json")
    
    cached = load_cached_json(json_path)
    if cached is not None:
        return {"score": score, "json": json_result, "json_path": json_path}

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_result, f, indent=2, ensure_ascii=False)

    return {"score": score, "json": json_result, "json_path": json_path}