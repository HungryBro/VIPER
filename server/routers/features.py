# server/routers/features.py
import os
from typing import Callable, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..utils_io import read_json, static_url
from ..database import get_db
from ..processing import failures_as, public_url, record_result, require_file

from server.algos.feature.sift_adapter import run as sift_run
from server.algos.feature.orb_adapter import run as orb_run
from server.algos.feature.surf_adapter import run as surf_run

router = APIRouter()


class FeatureReq(BaseModel):
    image_path: str
    params: Optional[dict] = None


def _add_feature_route(name: str, run: Callable) -> None:
    @router.post(f"/{name}", name=f"feature_{name}")
    def extract(req: FeatureReq, db: Session = Depends(get_db)):
        img_path = require_file(req.image_path, "Image not found at: {path}")
        with failures_as(500):
            params = req.params or {}
            json_path, vis_path = run(img_path, **params)
            data = read_json(json_path)

            web_json_url = static_url(json_path)
            web_vis_url = static_url(vis_path) if vis_path and os.path.exists(vis_path) else None

            record_id = record_result(
                db, name, data.get(f"{name}_parameters_used", params),
                json_path=str(json_path),
                vis_path=str(vis_path) if vis_path else None,
                json_url=public_url(web_json_url),
                vis_url=public_url(web_vis_url),
            )

            return {
                "status": "success",
                "tool": name.upper(),
                "num_keypoints": data.get("num_keypoints"),
                "descriptor_dim": data.get("descriptor_dim"),
                "json_url": web_json_url,
                "vis_url": web_vis_url,
                "json_data": data,
                "db_record_id": record_id
            }


_add_feature_route("sift", sift_run)
_add_feature_route("orb", orb_run)
_add_feature_route("surf", surf_run)
