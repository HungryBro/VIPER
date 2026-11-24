"""What every processing endpoint does around its algorithm.

Find the input, turn a failure into an HTTP error, and keep a record of the
run. The algorithm and the shape of its response stay in the router.
"""
import logging
import os
from contextlib import contextmanager
from typing import Any, Iterator, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .utils_io import resolve_image_path

logger = logging.getLogger(__name__)


def require_file(reference: str, detail: str) -> str:
    """Path of the file the client referred to, or 404 when it is not on disk.

    `detail` may contain `{path}`, which is replaced by where the file was expected.
    """
    try:
        path = resolve_image_path(reference)
    except ValueError:
        # Outside OUT: answered like a missing file, so it tells nothing about what exists there.
        raise HTTPException(status_code=404, detail=detail.replace("{path}", reference))
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=detail.replace("{path}", path))
    return path


@contextmanager
def failures_as(status_code: int, prefix: str = "") -> Iterator[None]:
    """Report any error raised by the algorithm as `status_code`, its message prefixed with `prefix`."""
    try:
        yield
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status_code, detail=f"{prefix}{e}")


def public_url(web_url: Optional[str]) -> Optional[str]:
    """Absolute URL of a /static path, as stored in the results table."""
    if not web_url:
        return None
    path = os.path.normpath(web_url).replace("\\", "/").lstrip("/")
    return f"{settings.backend_url}/{path}"


def record_result(
    db: Session,
    node_type: str,
    parameters: Any,
    *,
    json_path: Optional[str],
    vis_path: Optional[str] = None,
    json_url: Optional[str] = None,
    vis_url: Optional[str] = None,
) -> Optional[int]:
    """Store one run in the results table and return its id.

    The record is a log of what ran, not part of the result: if it cannot be
    written the request still succeeds and the id is None.
    """
    try:
        row = models.AlgorithmResult(
            node_type=node_type,
            parameters=parameters,
            json_path=json_path,
            vis_path=vis_path,
            json_url=json_url,
            vis_url=vis_url,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row.id
    except Exception:
        db.rollback()
        logger.exception("Could not record %s result", node_type)
        return None
