# server/algos/feature/sift_adapter.py
import os
from typing import Optional, Tuple, Union

import cv2
import numpy as np

from .extraction import extract_features

DEFAULTS = {"nfeatures": 500, "nOctaveLayers": 3, "contrastThreshold": 0.04, "edgeThreshold": 10, "sigma": 1.6}


def run(
    image_path: Union[str, os.PathLike],
    out_dir: Optional[Union[str, os.PathLike]] = None,
    **params
) -> Tuple[str, str]:
    p = {**DEFAULTS, **params}
    settings = {
        "nfeatures": int(p["nfeatures"]),
        "nOctaveLayers": int(p["nOctaveLayers"]),
        "contrastThreshold": float(p["contrastThreshold"]),
        "edgeThreshold": float(p["edgeThreshold"]),
        "sigma": float(p["sigma"]),
    }

    def detect(img):
        kps, desc = cv2.SIFT_create(**settings).detectAndCompute(img, None)
        if desc is None:
            desc = np.empty((0, 128), np.float32)
        return kps, desc, dict(settings), 128

    return extract_features("SIFT", image_path, out_dir, settings, detect, shape_key="processed_sift")
