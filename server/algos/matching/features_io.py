"""Reading the feature JSON written by SIFT, SURF or ORB, for the matchers."""
import os
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from server.utils_io import locate_file, read_json


def load_features(json_path: str, consumer: str) -> Tuple[List[cv2.KeyPoint], np.ndarray, str, Optional[str], Dict[str, Any]]:
    """Keypoints, descriptors, tool name, source image path, and extras (ORB: "WTA_K") of a feature JSON.

    Raises ValueError when the file is a matcher result, or has neither a tool
    nor keypoints. An unknown tool without descriptors yields a (0, 0) array.
    """
    data = read_json(json_path)
    if "matching_tool" in data:
        raise ValueError(f"Invalid input: Input is a '{data['matching_tool']}' result. {consumer} requires Feature files (SIFT/SURF/ORB).")
    if "tool" not in data and "keypoints" not in data:
        raise ValueError("Invalid input: JSON missing 'tool' and 'keypoints'.")

    tool = str(data.get("tool", "UNKNOWN")).upper()
    keypoints: List[cv2.KeyPoint] = []
    desc_list: List[Any] = []
    for kp in data.get("keypoints", []):
        keypoints.append(
            cv2.KeyPoint(
                x=float(kp["x"]), y=float(kp["y"]),
                size=float(kp.get("size", 1.0)),
                angle=float(kp.get("angle", -1)),
                response=float(kp.get("response", 0)),
                octave=int(kp.get("octave", 0)),
                class_id=int(kp.get("class_id", -1)),
            )
        )
        if kp.get("descriptor") is not None:
            desc_list.append(kp["descriptor"])

    extra: Dict[str, Any] = {}
    if tool in ("SIFT", "SURF"):
        descriptors = np.array(desc_list, dtype=np.float32)
        if descriptors.size == 0:
            descriptors = np.empty((0, int(data.get("descriptor_dim", 128))), dtype=np.float32)
    elif tool == "ORB":
        descriptors = np.array(desc_list, dtype=np.uint8)
        if descriptors.size == 0:
            descriptors = np.empty((0, 32), dtype=np.uint8)
        try:
            extra["WTA_K"] = int(data.get("orb_parameters_used", {}).get("WTA_K"))
        except (TypeError, ValueError):
            extra["WTA_K"] = None
    else:
        descriptors = np.array(desc_list) if desc_list else np.empty((0, 0))

    image = data.get("image", {}) or {}
    img_path = image.get("original_path") or image.get("file_name")
    if img_path:
        img_path = locate_file(img_path)
    return keypoints, descriptors, tool, img_path, extra


def image_size(img_path: Optional[str]) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    """(width, height, channels) of an image, or Nones when it cannot be read."""
    if not img_path: return None, None, None
    real_path = locate_file(img_path)
    if not os.path.exists(real_path): return None, None, None
    img = cv2.imread(real_path, cv2.IMREAD_UNCHANGED)
    if img is None: return None, None, None
    h, w = img.shape[:2]
    c = 1 if img.ndim == 2 else img.shape[2]
    return w, h, c
