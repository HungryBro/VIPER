# project_n2n/server/algos/Classification/otsu_adapter.py
import os
import json
from typing import Dict, Any, Tuple, Optional

import cv2
import numpy as np

from server.algos.inputs import image_input
from server.cache_utils import config_hash
from server.utils_io import ensure_dirs


def _to_gray(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2:
        return img
    if img.ndim == 3 and img.shape[2] == 4: 
        return cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def _apply_morph(bin_img: np.ndarray, open_it: bool, close_it: bool, k: int) -> np.ndarray:
    if k is None or k < 1:
        k = 3
    k = int(k // 2 * 2 + 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    out = bin_img.copy()
    if open_it:
        out = cv2.morphologyEx(out, cv2.MORPH_OPEN, kernel)
    if close_it:
        out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, kernel)
    return out


def _draw_histogram(gray: np.ndarray, thresh_val: int, out_path: str):
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten()
    h, w = 180, 320
    canvas = np.full((h, w, 3), 255, np.uint8)
    maxv = float(hist.max()) or 1.0

    xs = np.linspace(0, w - 1, 256).astype(int)
    vals = (hist / maxv * (h - 20)).astype(int)
    for x, v in zip(xs, vals):
        cv2.line(canvas, (x, h - 10), (x, h - 10 - int(v)), (90, 90, 90), 1)

    tx = int(thresh_val / 255.0 * (w - 1))
    cv2.line(canvas, (tx, 0), (tx, h), (0, 0, 255), 2)
    cv2.putText(canvas, f"T={thresh_val}", (tx + 6, 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 180), 1, cv2.LINE_AA)

    cv2.imwrite(out_path, canvas)


def run(
    image_path: str,
    out_root: str,
    *,
    gaussian_blur: bool = True,
    blur_ksize: int = 5,
    invert: bool = False,
    morph_open: bool = False,
    morph_close: bool = False,
    morph_kernel: int = 3,
    show_histogram: bool = False,
    **kwargs
) -> Tuple[str, Optional[str]]:
    
    image_path = image_input(image_path, "Otsu")

    out_dir = os.path.join(out_root, "features", "otsu_outputs")
    ensure_dirs(out_dir)
    
    config_map = {
        "img": os.path.basename(image_path),
        "blur": gaussian_blur, "k": blur_ksize,
        "inv": invert,
        "open": morph_open, "close": morph_close, "mk": morph_kernel,
        "hist": show_histogram
    }
    
    param_hash = config_hash(config_map)
    
    base_name = os.path.splitext(os.path.basename(image_path))[0]
    stem = f"otsu_{base_name}_{param_hash}"

    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")
    
    gray = _to_gray(img)

    if gaussian_blur:
        k = int(blur_ksize // 2 * 2 + 1) if blur_ksize else 5
        gray_blur = cv2.GaussianBlur(gray, (k, k), 0)
    else:
        gray_blur = gray

    flag = cv2.THRESH_BINARY_INV if invert else cv2.THRESH_BINARY
    tval, binary = cv2.threshold(gray_blur, 0, 255, flag | cv2.THRESH_OTSU)
    tval = int(round(tval))

    if morph_open or morph_close:
        binary = _apply_morph(binary, morph_open, morph_close, morph_kernel)

    bin_name = f"{stem}_binary.png"
    json_name = f"{stem}.json"
    hist_name = f"{stem}_hist.png"

    bin_path = os.path.join(out_dir, bin_name)
    json_path = os.path.join(out_dir, json_name)
    hist_path = os.path.join(out_dir, hist_name)

    if not (os.path.exists(json_path) and os.path.exists(bin_path)):
        cv2.imwrite(bin_path, binary)

        hist_path_out = None
        if show_histogram:
            _draw_histogram(gray_blur, tval, hist_path)
            if os.path.exists(hist_path):
                hist_path_out = hist_path

        H, W = int(gray.shape[0]), int(gray.shape[1])
        
        binary_url = f"/static/features/otsu_outputs/{bin_name}"
        histogram_url = f"/static/features/otsu_outputs/{hist_name}" if hist_path_out else None

        result: Dict[str, Any] = {
            "tool": "OtsuThreshold",
            "output_type": "classification",
            "tool_version": cv2.__version__,
            "input_image": {
                "path": image_path,
                "shape": [H, W],
                "dtype": str(gray.dtype),
            },
            "parameters": config_map, 
            "threshold_value": tval,
            "output": {
                "binary_mask_path": bin_path,
                "binary_mask_shape": [int(binary.shape[0]), int(binary.shape[1])],
                "histogram_path": hist_path_out,
                "binary_url": binary_url,
                "histogram_url": histogram_url,
                "result_image_url": binary_url 
            },
            "binary_url": binary_url,
            "notes": "Binary image is 0/255 (uint8).",
        }

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

    return json_path, bin_path