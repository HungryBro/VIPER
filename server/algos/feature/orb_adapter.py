# server/algos/feature/orb_adapter.py
import os
from typing import Optional, Tuple, Union

import cv2
import numpy as np

from .extraction import extract_features

DEFAULTS = {
    "nfeatures": 500, "scaleFactor": 1.2, "nlevels": 8, "edgeThreshold": 31, "firstLevel": 0,
    "WTA_K": 2, "scoreType": "FAST", "patchSize": 31, "fastThreshold": 20,
}


def run(
    image_path: Union[str, os.PathLike],
    out_dir: Optional[Union[str, os.PathLike]] = None,
    **params
) -> Tuple[str, str]:
    p = {**DEFAULTS, **params}
    settings = {
        "nfeatures": int(p["nfeatures"]),
        "scaleFactor": float(p["scaleFactor"]),
        "nlevels": int(p["nlevels"]),
        "edgeThreshold": int(p["edgeThreshold"]),
        "firstLevel": int(p["firstLevel"]),
        "WTA_K": int(p["WTA_K"]),
        "scoreType": str(p["scoreType"]),
        "patchSize": int(p["patchSize"]),
        "fastThreshold": int(p["fastThreshold"]),
    }

    def detect(img):
        orb = cv2.ORB_create(
            nfeatures=settings["nfeatures"],
            scaleFactor=settings["scaleFactor"],
            nlevels=settings["nlevels"],
            edgeThreshold=settings["edgeThreshold"],
            firstLevel=settings["firstLevel"],
            WTA_K=settings["WTA_K"],
            scoreType=cv2.ORB_FAST_SCORE if settings["scoreType"].upper()=="FAST" else cv2.ORB_HARRIS_SCORE,
            patchSize=settings["patchSize"],
            fastThreshold=settings["fastThreshold"],
        )
        kps, desc = orb.detectAndCompute(img, None)
        if desc is None:
            desc = np.empty((0, 32), dtype=np.uint8)
        used = {
            "nfeatures": orb.getMaxFeatures(),
            "scaleFactor": orb.getScaleFactor(),
            "nlevels": orb.getNLevels(),
            "edgeThreshold": orb.getEdgeThreshold(),
            "firstLevel": orb.getFirstLevel(),
            "WTA_K": orb.getWTA_K(),
            "scoreType": settings["scoreType"],
            "patchSize": orb.getPatchSize(),
            "fastThreshold": orb.getFastThreshold()
        }
        return kps, desc, used, 32

    return extract_features("ORB", image_path, out_dir, settings, detect, shape_key="processed_orb")
