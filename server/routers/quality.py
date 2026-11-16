# server/routers/quality.py
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..utils_io import OUT, static_url
from ..database import get_db
from ..processing import failures_as, public_url, record_result, require_file

from server.algos.quality.brisque_adapter import run as brisque_run
from server.algos.quality.psnr_adapter import run as psnr_run
from server.algos.quality.ssim_adapter import compute_ssim

router = APIRouter()

# Quality metrics produce no picture. The results table shows "-" in the two
# picture columns for them instead of an empty cell.
NO_PICTURE = "-"


def _record_metric(db: Session, node_type: str, parameters: dict, json_path: str, web_json_url: Optional[str]) -> Optional[int]:
    return record_result(
        db, node_type, parameters,
        json_path=str(json_path),
        vis_path=NO_PICTURE,
        json_url=public_url(web_json_url),
        vis_url=NO_PICTURE,
    )


def _require_pair(req: "MetricReq") -> tuple:
    detail = "Original or Processed image not found"
    return require_file(req.original_path, detail), require_file(req.processed_path, detail)

class QualityReq(BaseModel):
    image_path: str
    params: Optional[dict] = None

class MetricReq(BaseModel):
    original_path: str
    processed_path: str
    params: Optional[dict] = None


@router.post("/brisque")
def quality_brisque(req: QualityReq, db: Session = Depends(get_db)):
    img_path = require_file(req.image_path, "Image not found")

    with failures_as(400):
        json_path, data = brisque_run(img_path, out_root=OUT)

        web_json_url = static_url(json_path)
        record_id = _record_metric(db, "quality_brisque", data.get("parameters_used", {}), json_path, web_json_url)

        return {
            "status": "success",
            "tool": "BRISQUE",
            "score": data.get("quality_score"),
            "quality_bucket": data.get("quality_bucket"),
            "json_url": web_json_url,
            "message": "Lower score = better perceptual quality",
            "db_record_id": record_id
        }

@router.post("/psnr")
def quality_psnr(req: MetricReq, db: Session = Depends(get_db)):
    p1, p2 = _require_pair(req)

    with failures_as(400):
        json_path, data = psnr_run(p1, p2, out_root=OUT, use_luma=True)
        web_json_url = static_url(json_path)
        record_id = _record_metric(db, "quality_psnr", {"use_luma": True}, json_path, web_json_url)

        return {
            "status": "success",
            "tool": "PSNR",
            "quality_score": data["quality_score"],
            "score_interpretation": data.get("score_interpretation"),
            "json_url": web_json_url,
            "db_record_id": record_id
        }

@router.post("/ssim")
def quality_ssim(req: MetricReq, db: Session = Depends(get_db)):
    p1, p2 = _require_pair(req)

    params = req.params or {}
    default_params = {
        "data_range": 255, "win_size": 11, "gaussian_weights": True,
        "sigma": 1.5, "use_sample_covariance": True, "K1": 0.01, "K2": 0.03,
        "calculate_on_color": False,
    }
    final_params = {**default_params, **params}

    with failures_as(400):
        result = compute_ssim(p1, p2, out_root=OUT, **final_params)
        web_json_url = static_url(result["json_path"])
        record_id = _record_metric(db, "quality_ssim", final_params, result["json_path"], web_json_url)

        return {
            "status": "success",
            "tool": "SSIM",
            "score": float(result["score"]),
            "json_url": web_json_url,
            "message": "Higher is better (1.0 = identical)",
            "db_record_id": record_id
        }
