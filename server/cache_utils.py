"""Result caching shared by the algorithm adapters.

An adapter names its output files after a hash of everything that determines
the result. If those files already exist, the stored result is returned.
"""
import hashlib
import json
import os
from typing import Any, Dict, Optional


def config_hash(config: Dict[str, Any]) -> str:
    text = json.dumps(config, sort_keys=True, default=str)
    return hashlib.md5(text.encode("utf-8")).hexdigest()[:8]


def load_cached_json(json_path: str, *artifacts: str) -> Optional[Dict[str, Any]]:
    """Return the stored result if its JSON and every listed artifact exist and the JSON parses."""
    if not all(os.path.exists(p) for p in (json_path, *artifacts)):
        return None
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
