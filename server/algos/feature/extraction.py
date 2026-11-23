"""The steps every keypoint detector shares: read, detect, describe, save.

A detector module supplies only what is specific to it: its name, the
settings that identify a result, and how to detect on an image.
"""
import json
import os
import sys
from typing import Any, Callable, Dict, Optional, Tuple, Union

import cv2
import numpy as np

from server.algos.inputs import image_input
from server.cache_utils import config_hash, load_cached_json
from server.utils_io import OUT, ensure_dirs

# detect(image) -> (keypoints, descriptors, parameters actually used, descriptor width)
Detect = Callable[[np.ndarray], Tuple[Any, np.ndarray, Dict[str, Any], int]]


def _kp_dict(kp, desc_row):
    return {
        "x": round(kp.pt[0], 4),
        "y": round(kp.pt[1], 4),
        "size": round(kp.size, 4),
        "angle": round(kp.angle, 4),
        "response": round(kp.response, 6),
        "octave": int(kp.octave),
        "class_id": int(kp.class_id),
        "descriptor": desc_row.tolist() if desc_row is not None else None
    }


def extract_features(
    tool: str,
    image_path: Union[str, os.PathLike],
    out_dir: Optional[Union[str, os.PathLike]],
    settings: Dict[str, Any],
    detect: Detect,
    shape_key: str,
) -> Tuple[str, str]:
    """Run `detect` on the image and write `<tool>_<image>_<hash>.json` plus a keypoint drawing.

    `shape_key` prefixes the two fields of the JSON `image` section that record
    the shape and dtype the detector saw; each tool has always used its own.
    """
    image_path = image_input(os.fspath(image_path), tool)
    name = tool.lower()

    algo_dir = os.path.join(os.fspath(out_dir) if out_dir is not None else OUT, "features", f"{name}_outputs")
    ensure_dirs(algo_dir)

    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")

    config_map = {"img": os.path.basename(image_path), "mtime": os.path.getmtime(image_path), **settings}
    stem = f"{name}_{os.path.splitext(os.path.basename(image_path))[0]}_{config_hash(config_map)}"
    json_path = os.path.join(algo_dir, f"{stem}.json")
    vis_path = os.path.join(algo_dir, f"{stem}_vis.jpg")

    if load_cached_json(json_path, vis_path) is not None:
        return json_path, vis_path

    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    kps, desc, parameters_used, descriptor_dim = detect(img)
    kplist = [_kp_dict(k, desc[i] if i < len(desc) else None) for i, k in enumerate(kps or [])]

    if img.ndim == 3 and img.shape[2] in (3, 4):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.shape[2] == 3 else cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
    else:
        gray = img

    payload = {
        "tool": tool,
        "tool_version": {"opencv": cv2.__version__, "python": sys.version.split()[0]},
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            f"{shape_key}_shape": list(gray.shape),
            f"{shape_key}_dtype": str(gray.dtype)
        },
        f"{name}_parameters_used": parameters_used,
        "num_keypoints": len(kplist),
        "descriptor_dim": descriptor_dim,
        "keypoints": kplist,
        "descriptors": desc.tolist(),
        "parameters_hash": config_map
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    if img.ndim == 2:
        vis_src = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    elif img.ndim == 3 and img.shape[2] == 4:
        vis_src = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    else:
        vis_src = img.copy()

    vis = cv2.drawKeypoints(
        vis_src, kps, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS
    )

    cv2.imwrite(vis_path, vis)

    return json_path, vis_path
