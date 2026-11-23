"""How an algorithm turns the reference it was handed into an image on disk.

A node can be wired to an image or to the result JSON of an upstream node. A
result JSON stands for the image it describes, unless it is a feature or a
matcher result, which describe no single image.
"""
import json
from typing import Any, Dict, Optional

from server.utils_io import locate_file

FEATURE_TOOLS = ("SIFT", "SURF", "ORB")
MATCHER_TOOLS = ("BFMatcher", "FLANNBasedMatcher")


def _load_result(path: str) -> Optional[Dict[str, Any]]:
    if not path.lower().endswith(".json"):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError, PermissionError):
        return None


def image_input(path: str, consumer: str, *, accept_features: bool = False) -> str:
    """Return the image `consumer` should read for `path`.

    Raises ValueError when `path` is a matcher result, or a feature result
    unless `accept_features` (then the image the features came from is used).
    """
    meta = _load_result(path)
    if meta is None:
        return locate_file(path)

    if "matching_tool" in meta or meta.get("tool") in MATCHER_TOOLS:
        matcher = meta.get("matching_tool") or meta.get("tool")
        raise ValueError(f"Invalid Input: {consumer} cannot run on '{matcher}' result JSON.")
    if not accept_features and meta.get("tool") in FEATURE_TOOLS:
        raise ValueError(f"Invalid Input: {consumer} cannot run on '{meta['tool']}' feature JSON.")

    described = (
        meta.get("image", {}).get("original_path")
        or meta.get("output", {}).get("aligned_image")
        or meta.get("output", {}).get("result_image_url")
        or meta.get("result_image_url")
    )
    return locate_file(described or path)
