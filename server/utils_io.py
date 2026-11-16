# server/utils_io.py
"""Where VIPER keeps files, and how a reference to one becomes a path on disk.

Every module that needs the project layout reads it from here.
"""
import os
import uuid
import json
from pathlib import Path
from urllib.parse import urlparse
from typing import Optional
from fastapi import UploadFile

# --- Path Configuration ---
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.getenv("N2N_OUT", os.path.join(PROJECT_ROOT, "outputs"))
UPLOAD_DIR = os.path.join(OUT, "uploads")

# Result JSONs record absolute paths from the machine that produced them. The
# bundled samples were produced elsewhere, so a recorded path that no longer
# exists is looked up by file name in these folders under OUT, in this order.
_SEARCH_SUBDIRS = (
    os.path.join("samples", "json", "matching"),
    os.path.join("samples", "json", "alignment"),
    "samples",
    "uploads",
    "",
)


def ensure_dirs(*paths: str) -> None:
    for p in paths: os.makedirs(p, exist_ok=True)


def resolve_image_path(p: str) -> str:
    """Map a URL or /static path sent by the frontend to its file under OUT."""
    if not p: return p
    if p.startswith("http://") or p.startswith("https://"):
        path_part = urlparse(p).path or ""
    else:
        path_part = p

    if path_part.startswith("/static/"):
        rel = path_part[len("/static/"):]
        return str(os.path.join(OUT, rel.lstrip("/")))

    if "/uploads/" in path_part:
        name = Path(path_part).name
        return str(os.path.join(UPLOAD_DIR, name))
    return p


def locate_file(path: str) -> str:
    """Find the file a request or a result JSON refers to; return `path` unchanged if none exists."""
    if not path or os.path.exists(path): return path

    mapped = resolve_image_path(path)
    if os.path.exists(mapped): return mapped

    name = os.path.basename(path)
    for sub in _SEARCH_SUBDIRS:
        candidate = os.path.join(OUT, sub, name)
        if os.path.exists(candidate): return candidate

    in_project = os.path.join(PROJECT_ROOT, path.lstrip("/"))
    if os.path.exists(in_project): return in_project
    return path


def read_json(path: str) -> dict:
    if not os.path.exists(path):
        raise FileNotFoundError(f"JSON file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


async def save_upload(f: UploadFile, dst_dir: str) -> str:
    ensure_dirs(dst_dir)
    ext = os.path.splitext(f.filename)[1] or ".bin"
    fname = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(dst_dir, fname)
    with open(path, "wb") as out:
        out.write(await f.read())
    return path


def static_url(abs_path: str) -> Optional[str]:
    """The /static URL that serves a file stored under OUT."""
    if not abs_path: return None
    try:
        rel = os.path.relpath(abs_path, OUT).replace("\\", "/")
        return f"/static/{rel}"
    except ValueError:
        return None
