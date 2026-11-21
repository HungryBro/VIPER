# server/utils_io.py
"""Where VIPER keeps files, and how a reference to one becomes a path on disk.

Every module that needs the project layout reads it from here.
"""
import io
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


# --- Checked uploads (B1, C2) ---
# The type of an uploaded file comes from its bytes, never from the client's
# filename or content-type, and the server picks the extension. Files under
# /static are served by extension, so an HTML or SVG file renamed to .png, or a
# .png that is really HTML, must never be stored as is.

# Image formats /api/upload has always taken (the Image Input nodes accept
# .jpg .jpeg .png .bmp .webp .tif .tiff). MPO is how Pillow reports a JPEG from
# some phone cameras.
UPLOAD_IMAGE_EXTENSIONS = {
    "JPEG": ".jpg",
    "MPO": ".jpg",
    "PNG": ".png",
    "BMP": ".bmp",
    "WEBP": ".webp",
    "TIFF": ".tif",
}
# The U-Net node uploads its weights through /api/upload. A PyTorch file is a
# zip archive (current format) or a pickle stream (legacy format).
UPLOAD_MODEL_EXTENSIONS = {".pt", ".pth"}
_ZIP_MAGIC = b"PK\x03\x04"
_PICKLE_PROTOCOL_BYTE = 0x80

COVER_IMAGE_FORMATS = {"JPEG": ".jpg", "MPO": ".jpg", "PNG": ".png", "WEBP": ".webp"}


class UploadRejected(ValueError):
    """The uploaded bytes are not a file type this endpoint accepts."""


def detect_image_format(contents: bytes) -> Optional[str]:
    """Pillow's format name for these bytes ("JPEG", "PNG", ...), or None if they are not an image."""
    from PIL import Image, UnidentifiedImageError

    try:
        with Image.open(io.BytesIO(contents)) as image:
            image_format = image.format
            image.verify()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError):
        return None
    return image_format


def checked_upload_extension(filename: Optional[str], contents: bytes) -> str:
    """The extension to store an /api/upload file under, decided from its bytes."""
    image_format = detect_image_format(contents)
    if image_format in UPLOAD_IMAGE_EXTENSIONS:
        return UPLOAD_IMAGE_EXTENSIONS[image_format]

    client_ext = os.path.splitext(filename or "")[1].lower()
    if client_ext in UPLOAD_MODEL_EXTENSIONS and (
        contents.startswith(_ZIP_MAGIC) or (contents[:1] and contents[0] == _PICKLE_PROTOCOL_BYTE)
    ):
        return client_ext
    raise UploadRejected(
        "Unsupported file: upload a JPEG, PNG, BMP, WebP or TIFF image, or a .pt/.pth model file"
    )


def save_reencoded_cover(contents: bytes, dst_dir: str) -> tuple[str, str]:
    """Decode a cover image and save a fresh encoding of its pixels; returns (path, Pillow format).

    Only what Pillow decodes as JPEG, PNG or WebP is accepted. Writing the pixels
    again drops anything else the file carried (scripts, trailing data, metadata).
    """
    from PIL import Image, ImageOps, UnidentifiedImageError

    try:
        with Image.open(io.BytesIO(contents)) as image:
            image_format = image.format
            if image_format not in COVER_IMAGE_FORMATS:
                raise UploadRejected("Cover image must be a JPEG, PNG, or WebP file")
            image.load()
            # Re-encoding drops EXIF, so apply its rotation to the pixels first.
            pixels = ImageOps.exif_transpose(image)
    except UploadRejected:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError) as exc:
        raise UploadRejected("Cover image must be a JPEG, PNG, or WebP file") from exc

    save_format = "JPEG" if image_format == "MPO" else image_format
    if save_format == "JPEG" and pixels.mode not in ("RGB", "L"):
        pixels = pixels.convert("RGB")
    ensure_dirs(dst_dir)
    path = os.path.join(dst_dir, f"{uuid.uuid4().hex}{COVER_IMAGE_FORMATS[image_format]}")
    options = {"quality": 90} if save_format in ("JPEG", "WEBP") else {}
    pixels.save(path, format=save_format, **options)
    return path, save_format


def static_url(abs_path: str) -> Optional[str]:
    """The /static URL that serves a file stored under OUT."""
    if not abs_path: return None
    try:
        rel = os.path.relpath(abs_path, OUT).replace("\\", "/")
        return f"/static/{rel}"
    except ValueError:
        return None
