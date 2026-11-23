# project_n2n/server/algos/Classification/snake_adapter.py
import os
import json
from typing import Dict, Any, Tuple, Optional, List

import cv2
import numpy as np

from server.algos.inputs import image_input
from server.cache_utils import config_hash
from server.utils_io import ensure_dirs

try:
    from skimage.segmentation import active_contour
    from skimage.filters import gaussian
    HAS_SKIMAGE = True
except ImportError:
    HAS_SKIMAGE = False


def _to_gray(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2:
        return img
    if img.ndim == 3 and img.shape[2] == 4:
        return cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

def _contour_to_mask(contour_rc: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    poly = np.round(contour_rc[:, ::-1]).astype(np.int32)
    mask = np.zeros(shape, dtype=np.uint8)
    if len(poly) >= 3:
        cv2.fillPoly(mask, [poly], 255)
    return mask

def _draw_overlay(base: np.ndarray, contour_rc: np.ndarray, color=(0, 0, 255)) -> np.ndarray:
    if base.ndim == 2:
        vis = cv2.cvtColor(base, cv2.COLOR_GRAY2BGR)
    else:
        vis = base.copy()
        if vis.ndim == 3 and vis.shape[2] == 4:
            vis = vis[:, :, :3]
            
    pts = np.round(contour_rc[:, ::-1]).astype(np.int32)
    if len(pts) >= 2:
        cv2.polylines(vis, [pts], isClosed=True, color=color, thickness=2, lineType=cv2.LINE_AA)
    return vis


def _init_snake_circle(h: int, w: int, cx: Optional[int], cy: Optional[int], r: Optional[int], pts: int) -> np.ndarray:
    if cx is None: cx = w // 2
    if cy is None: cy = h // 2
    if r is None or r <= 0: r = min(h, w) // 3

    s = np.linspace(0, 2 * np.pi, int(max(8, pts)), endpoint=False)
    x = cx + r * np.cos(s)
    y = cy + r * np.sin(s)
    return np.stack([y, x], axis=1).astype(np.float32)

def _init_snake_bbox(h: int, w: int, x1, y1, x2, y2, pts: int) -> np.ndarray:
    if x1 is None: x1 = w * 0.2
    if y1 is None: y1 = h * 0.2
    if x2 is None: x2 = w * 0.8
    if y2 is None: y2 = h * 0.8
    
    n_side = max(4, pts // 4)
    
    top_x = np.linspace(x1, x2, n_side)
    top_y = np.full_like(top_x, y1)
    
    right_y = np.linspace(y1, y2, n_side)
    right_x = np.full_like(right_y, x2)
    
    bottom_x = np.linspace(x2, x1, n_side)
    bottom_y = np.full_like(bottom_x, y2)
    
    left_y = np.linspace(y2, y1, n_side)
    left_x = np.full_like(left_y, x1)
    
    xs = np.concatenate([top_x, right_x, bottom_x, left_x])
    ys = np.concatenate([top_y, right_y, bottom_y, left_y])
    
    return np.stack([ys, xs], axis=1).astype(np.float32)


def _prepare_image_for_snake(gray: np.ndarray, gaussian_blur_ksize: int) -> np.ndarray:
    if not HAS_SKIMAGE:
        return gray.astype(np.float32) / 255.0
        
    img_float = gray.astype(np.float32) / 255.0
    
    if gaussian_blur_ksize > 0:
        sigma = max(1.0, gaussian_blur_ksize / 3.0)
        img_float = gaussian(img_float, sigma=sigma, preserve_range=True)
        
    return img_float


def run(
    image_path: str,
    out_root: str,
    *,
    alpha: float = 0.2,
    beta: float = 0.2,
    gamma: float = 0.1,
    w_line: float = 0.0,
    w_edge: float = 1.0,
    max_iterations: int = 250,
    convergence: float = 0.001,
    
    init_mode: str = "circle",
    init_cx: Optional[int] = None,
    init_cy: Optional[int] = None,
    init_radius: Optional[int] = None,
    init_points: int = 400,
    
    from_point_x: Optional[float] = None,
    from_point_y: Optional[float] = None,
    
    bbox_x1: Optional[float] = None,
    bbox_y1: Optional[float] = None,
    bbox_x2: Optional[float] = None,
    bbox_y2: Optional[float] = None,
    
    gaussian_blur_ksize: int = 0,
) -> Tuple[str, Optional[str], Optional[str]]:
    
    image_path = image_input(image_path, "Snake", accept_features=True)

    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")
    
    gray = _to_gray(img)
    h, w = gray.shape[:2]
    
    pts = int(max(8, init_points))
    snake0 = None

    if init_mode == "point" and from_point_x is not None and from_point_y is not None:
        r = init_radius if init_radius else 20
        snake0 = _init_snake_circle(h, w, from_point_x, from_point_y, r, pts)
        
    elif init_mode == "bbox":
        snake0 = _init_snake_bbox(h, w, bbox_x1, bbox_y1, bbox_x2, bbox_y2, pts)
        
    else:
        snake0 = _init_snake_circle(h, w, init_cx, init_cy, init_radius, pts)

    warning_msg = None
    if HAS_SKIMAGE:
        fimg = _prepare_image_for_snake(gray, gaussian_blur_ksize)
        try:
            snake_rc = active_contour(
                image=fimg,
                snake=snake0,
                alpha=float(alpha),
                beta=float(beta),
                gamma=float(gamma),
                w_line=float(w_line),
                w_edge=float(w_edge),
                max_num_iter=int(max_iterations),
                convergence=float(convergence),
                boundary_condition='periodic'
            )
        except Exception as e:
            print(f"Snake calculation error: {e}. Returning initial contour.")
            warning_msg = f"Snake calculation failed: {str(e)}"
            snake_rc = snake0
    else:
        print("Warning: scikit-image not installed. Snake will not evolve.")
        warning_msg = "scikit-image not installed. Showing initial contour only."
        snake_rc = snake0

    out_dir = os.path.join(out_root, "features", "snake_outputs")
    ensure_dirs(out_dir)
    
    config_to_hash = {
        "image_filename": os.path.basename(image_path), 
        "alpha": alpha,
        "beta": beta,
        "gamma": gamma,
        "w_line": w_line,
        "w_edge": w_edge,
        "max_iterations": max_iterations,
        "convergence": convergence,
        "gaussian_blur_ksize": gaussian_blur_ksize,
        "init_mode": init_mode,
        "init_params": { 
            "cx": init_cx, "cy": init_cy, "r": init_radius,
            "px": from_point_x, "py": from_point_y,
            "bbox": [bbox_x1, bbox_y1, bbox_x2, bbox_y2]
        }
    }
    
    param_hash = config_hash(config_to_hash)
    
    base_name = os.path.splitext(os.path.basename(image_path))[0]
    

    stem = f"snake_{base_name}_{param_hash}"

    mask = _contour_to_mask(snake_rc, shape=(h, w))
    overlay = _draw_overlay(gray, snake_rc)

    json_path = os.path.join(out_dir, f"{stem}.json")
    
    overlay_name = f"{stem}_overlay.png"
    mask_name = f"{stem}_mask.png"
    
    overlay_path = os.path.join(out_dir, overlay_name)
    mask_path = os.path.join(out_dir, mask_name)

    cv2.imwrite(overlay_path, overlay)
    cv2.imwrite(mask_path, mask)

    contour_points_xy: List[List[float]] = [[float(x), float(y)] for (y, x) in snake_rc]

    result: Dict[str, Any] = {
        "tool": "SnakeActiveContour",
        "output_type": "classification",
        "tool_version": {"opencv": cv2.__version__},
        "input_image": {
            "path": image_path,
            "shape": [int(h), int(w)],
            "dtype": str(gray.dtype),
        },
        "parameters": {
            "alpha": float(alpha),
            "beta": float(beta),
            "gamma": float(gamma),
            "w_line": float(w_line),
            "w_edge": float(w_edge),
            "max_iterations": int(max_iterations),
            "convergence": float(convergence),
            "gaussian_blur_ksize": int(gaussian_blur_ksize),
            "init_mode": init_mode,
            "init_points": int(pts),
            "init_cx": init_cx,
            "init_cy": init_cy,
            "init_radius": init_radius,
            "from_point_x": from_point_x,
            "from_point_y": from_point_y,
            "bbox": [bbox_x1, bbox_y1, bbox_x2, bbox_y2]
        },
        "output": {
            "contour_points_xy": contour_points_xy,
            "mask_path": mask_path,
            "overlay_path": overlay_path,
            "iterations": int(max_iterations),
            "overlay_url": f"/static/features/snake_outputs/{overlay_name}",
            "mask_url": f"/static/features/snake_outputs/{mask_name}",
            "result_image_url": f"/static/features/snake_outputs/{overlay_name}"
        },
        "warning": warning_msg
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    return json_path, overlay_path, mask_path