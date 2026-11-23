# project_n2n/server/algos/feature/surf_adapter.py
import os
from typing import Optional, Tuple, Union

import cv2
import numpy as np

from .extraction import extract_features

DEFAULTS = {"hessianThreshold": 100, "nOctaves": 4, "nOctaveLayers": 3, "extended": False, "upright": False}


def run(
    image_path: Union[str, os.PathLike],
    out_dir: Optional[Union[str, os.PathLike]] = None,
    **params
) -> Tuple[str, str]:
    if not hasattr(cv2, "xfeatures2d") or not hasattr(cv2.xfeatures2d, "SURF_create"):
        raise RuntimeError("SURF not available. Please install 'opencv-contrib-python'.")

    p = {**DEFAULTS, **params}
    hessian = float(p["hessianThreshold"])
    n_octaves = int(p["nOctaves"])
    n_layers = int(p["nOctaveLayers"])
    extended = bool(p["extended"])
    upright = bool(p["upright"])

    settings = {
        "hessian": hessian,
        "octaves": n_octaves,
        "layers": n_layers,
        "extended": extended,
        "upright": upright
    }

    def detect(img):
        surf = cv2.xfeatures2d.SURF_create(
            hessianThreshold=hessian,
            nOctaves=n_octaves,
            nOctaveLayers=n_layers,
            extended=extended,
            upright=upright,
        )
        kps, desc = surf.detectAndCompute(img, None)
        full_dim = 128 if surf.getExtended() else 64
        if desc is None:
            desc = np.empty((0, full_dim), dtype=np.float32)
        elif desc.dtype != np.float32:
            desc = desc.astype(np.float32)
        used = {
            "hessianThreshold": surf.getHessianThreshold(),
            "nOctaves": surf.getNOctaves(),
            "nOctaveLayers": surf.getNOctaveLayers(),
            "extended": bool(surf.getExtended()),
            "upright": bool(surf.getUpright()),
        }
        return kps, desc, used, desc.shape[1] if desc.shape[0] > 0 else full_dim

    return extract_features("SURF", image_path, out_dir, settings, detect, shape_key="processed")
