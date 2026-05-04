# server/routers/quality.py
import os
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..utils_io import resolve_image_path, OUT, RESULT_DIR, static_url
from ..database import get_db
from .. import models

from server.algos.quality.brisque_adapter import run as brisque_run
from server.algos.quality.psnr_adapter import run as psnr_run
from server.algos.quality.ssim_adapter import compute_ssim

router = APIRouter()

BASE_URL = "http://localhost:8000"

def clean_url_for_db(u: str) -> Optional[str]:
    if not u: 
        return None
    normalized = os.path.normpath(u)
    normalized = normalized.replace("\\", "/")
    normalized = normalized.lstrip("/")
    return f"{BASE_URL}/{normalized}"

class QualityReq(BaseModel):
    image_path: str
    params: Optional[dict] = None

class MetricReq(BaseModel):
    original_path: str
    processed_path: str
    params: Optional[dict] = None


@router.post("/brisque")
def quality_brisque(req: QualityReq, db: Session = Depends(get_db)):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        json_path, data = brisque_run(img_path, out_root=RESULT_DIR)
        
        web_json_url = static_url(json_path, OUT)
        actual_params = data.get("parameters_used", {})

        # ==========================================
        # บันทึกผลลัพธ์ลง PostgreSQL
        # ==========================================
        try:
            db_result = models.AlgorithmResult(
                node_type="quality_brisque",
                parameters=actual_params,
                json_path=str(json_path),
                vis_path="-",   # ใส่ - เพื่อความสวยงามใน Adminer
                json_url=clean_url_for_db(web_json_url),
                vis_url="-"     # ใส่ - ตามที่คุยกันไว้
            )
            db.add(db_result)
            db.commit()
            db.refresh(db_result)
            record_id = db_result.id
        except Exception as db_err:
            db.rollback()
            record_id = None

        return {
            "status": "success",
            "tool": "BRISQUE",
            "score": data.get("quality_score"),
            "quality_bucket": data.get("quality_bucket"),
            "json_url": web_json_url,
            "message": "Lower score = better perceptual quality",
            "db_record_id": record_id
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/psnr")
def quality_psnr(req: MetricReq, db: Session = Depends(get_db)):
    p1 = resolve_image_path(req.original_path)
    p2 = resolve_image_path(req.processed_path)
    
    if not os.path.exists(p1) or not os.path.exists(p2):
        raise HTTPException(status_code=404, detail="Original or Processed image not found")

    try:
        json_path, data = psnr_run(p1, p2, out_root=RESULT_DIR, use_luma=True)
        web_json_url = static_url(json_path, OUT)

        try:
            db_result = models.AlgorithmResult(
                node_type="quality_psnr",
                parameters={"use_luma": True},
                json_path=str(json_path),
                vis_path="-",
                json_url=clean_url_for_db(web_json_url),
                vis_url="-"
            )
            db.add(db_result)
            db.commit()
            db.refresh(db_result)
            record_id = db_result.id
        except Exception as db_err:
            db.rollback()
            record_id = None

        return {
            "status": "success",
            "tool": "PSNR",
            "quality_score": data["quality_score"],
            "score_interpretation": data.get("score_interpretation"),
            "json_url": web_json_url,
            "db_record_id": record_id
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/ssim")
def quality_ssim(req: MetricReq, db: Session = Depends(get_db)):
    p1 = resolve_image_path(req.original_path)
    p2 = resolve_image_path(req.processed_path)
    
    if not os.path.exists(p1) or not os.path.exists(p2):
        raise HTTPException(status_code=404, detail="Original or Processed image not found")

    params = req.params or {}
    default_params = {
        "data_range": 255, "win_size": 11, "gaussian_weights": True,
        "sigma": 1.5, "use_sample_covariance": True, "K1": 0.01, "K2": 0.03,
        "calculate_on_color": False,
    }
    final_params = {**default_params, **params}

    try:
        result = compute_ssim(p1, p2, out_root=RESULT_DIR, **final_params)
        web_json_url = static_url(result["json_path"], OUT)

        try:
            db_result = models.AlgorithmResult(
                node_type="quality_ssim",
                parameters=final_params,
                json_path=str(result["json_path"]),
                vis_path="-",
                json_url=clean_url_for_db(web_json_url),
                vis_url="-"
            )
            db.add(db_result)
            db.commit()
            db.refresh(db_result)
            record_id = db_result.id
        except Exception as db_err:
            db.rollback()
            record_id = None

        return {
            "status": "success",
            "tool": "SSIM",
            "score": float(result["score"]),
            "json_url": web_json_url,
            "message": "Higher is better (1.0 = identical)",
            "db_record_id": record_id
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))