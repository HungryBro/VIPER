import os
import sys
import json
from typing import Optional, Tuple, Dict, Any

import cv2
import numpy as np

from server.algos.inputs import image_input
from server.cache_utils import config_hash, load_cached_json
from server.utils_io import OUT, PROJECT_ROOT, ensure_dirs

# กำหนด Root Project และ Path ของ Model
MODEL_PATH = os.path.join(PROJECT_ROOT, "server/algos/quality/brisque_models/brisque_model_live.yml")
RANGE_PATH = os.path.join(PROJECT_ROOT, "server/algos/quality/brisque_models/brisque_range_live.yml")


def _to_uint8_gray(img: np.ndarray, image_path: str) -> np.ndarray:
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    if img.ndim == 2:
        gray = img
    elif img.ndim == 3:
        ch = img.shape[2]
        if ch == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        elif ch == 4:
            gray = cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
        else:
            raise ValueError(f"Unsupported channel count ({ch}) in image: {image_path}")
    else:
        raise ValueError(f"Unsupported image shape {img.shape}: {image_path}")

    # Normalize to uint8 if needed
    if gray.dtype == np.uint8:
        return gray
    if gray.dtype == np.uint16:
        return (gray / 257).astype(np.uint8)
    if gray.dtype in (np.float32, np.float64):
        gmin, gmax = float(gray.min()), float(gray.max())
        if gmax > gmin:
            out = (gray - gmin) / (gmax - gmin)
            return np.clip(out * 255.0, 0, 255).astype(np.uint8)
        return np.zeros_like(gray, dtype=np.uint8)

    return gray.astype(np.uint8)

def _interpret_brisque(score: float) -> str:
    if score < 15: return "excellent"
    if score < 25: return "good"
    if score < 40: return "fair"
    if score < 60: return "poor"
    return "very_poor"

def run(image_path: str, out_root: Optional[str] = None) -> Tuple[str, Dict[str, Any]]:
    
    # 1. Handle JSON Input (from previous nodes)
    image_path = image_input(image_path, "BRISQUE", accept_features=True)

    # 2. Resolve Path
    abs_path = os.path.abspath(image_path)

    if out_root is None:
        out_root = OUT
        
    out_dir = os.path.join(out_root, "features", "brisque_outputs")
    ensure_dirs(out_dir)

    # 3. Config & Hashing
    config_map = {
        "img": os.path.basename(abs_path),
        "model": "default_live",
        "ver": "1.0",
        "mtime": os.path.getmtime(abs_path) if os.path.exists(abs_path) else 0
    }
    param_hash = config_hash(config_map)
    
    base_name = os.path.splitext(os.path.basename(abs_path))[0]
    stem = f"brisque_{base_name}_{param_hash}"
    out_json = os.path.join(out_dir, f"{stem}.json")

    # 4. Cache Check
    cached = load_cached_json(out_json)
    if cached is not None:
        return out_json, cached

    # 5. Load Image & Validation
    if not os.path.exists(abs_path):
        raise FileNotFoundError(f"Image file not found: {abs_path}")

    img = cv2.imread(abs_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {abs_path}")

    gray = _to_uint8_gray(img, abs_path)

    h, w = gray.shape[:2]
    if min(h, w) < 48:
        raise ValueError(f"Image too small for stable BRISQUE (got {w}x{h}); please use >= 48x48.")

    # 6. Check Model Files
    if not os.path.exists(MODEL_PATH) or not os.path.exists(RANGE_PATH):
        raise FileNotFoundError(f"BRISQUE model files not found at {MODEL_PATH} or {RANGE_PATH}")

    # 7. Compute Score
    try:
        scorer = cv2.quality.QualityBRISQUE_create(MODEL_PATH, RANGE_PATH)
    except AttributeError as e:
        raise RuntimeError("OpenCV 'quality' module not available. Please install 'opencv-contrib-python'.") from e

    score = float(scorer.compute(gray)[0])
    score_rounded = round(score, 4)
    score_bucket = _interpret_brisque(score)

    # 8. Output
    data: Dict[str, Any] = {
        "tool": "BRISQUE",
        "tool_version": {
            "opencv": cv2.__version__,
            "python": sys.version.split()[0],
        },
        "image": {
            "original_path": abs_path,
            "file_name": os.path.basename(abs_path),
            "processed_shape": [int(h), int(w)],
            "dtype": "uint8",
            "channels": 1,
        },
        "brisque_parameters_used": {
            "model_file": os.path.basename(MODEL_PATH),
            "range_file": os.path.basename(RANGE_PATH),
            "note": "Lower score = better perceptual quality",
        },
        "quality_score": score_rounded,
        "quality_bucket": score_bucket,
        "parameters_hash": config_map 
    }

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return out_json, data