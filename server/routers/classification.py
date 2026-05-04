# server/routers/classification.py
import os
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..utils_io import resolve_image_path, OUT, _read_json, RESULT_DIR, static_url
from ..database import get_db
from .. import models

from server.algos.Classification.otsu_adapter import run as otsu_run
from server.algos.Classification.snake_adapter import run as snake_run

router = APIRouter()

BASE_URL = "http://localhost:8000"

def clean_url_for_db(u: str) -> Optional[str]:
    if not u: 
        return None
    normalized = os.path.normpath(u)
    normalized = normalized.replace("\\", "/")
    normalized = normalized.lstrip("/")
    return f"{BASE_URL}/{normalized}"

class OtsuReq(BaseModel):
    image_path: str
    gaussian_blur: Optional[bool] = True
    blur_ksize: Optional[int] = 5
    invert: Optional[bool] = False
    morph_open: Optional[bool] = False
    morph_close: Optional[bool] = False
    morph_kernel: Optional[int] = 3
    show_histogram: Optional[bool] = False

class SnakeReq(BaseModel):
    image_path: str
    alpha: float = 0.015
    beta: float = 10.0
    gamma: float = 0.001
    w_line: float = 0.0
    w_edge: float = 1.0
    max_iterations: int = 250
    convergence: float = 0.1
    init_mode: str = "circle"
    init_cx: Optional[int] = None
    init_cy: Optional[int] = None
    init_radius: Optional[int] = None
    init_points: int = 400
    from_point_x: Optional[float] = None
    from_point_y: Optional[float] = None
    bbox_x1: Optional[float] = None
    bbox_y1: Optional[float] = None
    bbox_x2: Optional[float] = None
    bbox_y2: Optional[float] = None
    gaussian_blur_ksize: int = 5


@router.post("/otsu")
def classify_otsu(req: OtsuReq, db: Session = Depends(get_db)):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        json_path, bin_path = otsu_run(
            image_path=img_path,
            out_root=RESULT_DIR,
            gaussian_blur=req.gaussian_blur,
            blur_ksize=req.blur_ksize,
            invert=req.invert,
            morph_open=req.morph_open,
            morph_close=req.morph_close,
            morph_kernel=req.morph_kernel,
            show_histogram=req.show_histogram,
        )
        
        data = _read_json(json_path)
        actual_params = data.get("otsu_parameters_used", req.model_dump(exclude={"image_path"}))
        
        web_json_url = static_url(json_path, OUT)
        web_bin_url = static_url(bin_path, OUT) if bin_path else None
        web_hist_url = static_url(data.get("output", {}).get("histogram_path"), OUT) if data.get("output") else None

        # บันทึกผลลัพธ์ลง PostgreSQL
        try:
            db_result = models.AlgorithmResult(
                node_type="otsu_threshold",
                parameters=actual_params,
                json_path=str(json_path),
                vis_path=str(bin_path) if bin_path else None,
                json_url=clean_url_for_db(web_json_url),
                vis_url=clean_url_for_db(web_bin_url) 
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
            "tool": "OtsuThreshold",
            "json_path": json_path,
            "json_url": web_json_url,
            "binary_url": web_bin_url,
            "threshold": data.get("threshold_value"),
            "histogram_url": web_hist_url,
            "db_record_id": record_id
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Otsu failed: {str(e)}")


@router.post("/snake")
def classify_snake(req: SnakeReq, db: Session = Depends(get_db)):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        params = req.model_dump(exclude={"image_path"})
        json_path, overlay_path, mask_path = snake_run(
            image_path=img_path,
            out_root=RESULT_DIR,
            **params
        )

        data = _read_json(json_path)
        actual_params = data.get("snake_parameters_used", params)
        
        web_json_url = static_url(json_path, OUT)
        web_overlay_url = static_url(overlay_path, OUT)
        web_mask_url = static_url(mask_path, OUT)

        # บันทึกผลลัพธ์ลง PostgreSQL
        try:
            db_result = models.AlgorithmResult(
                node_type="snake_active_contour",
                parameters=actual_params,
                json_path=str(json_path),
                vis_path=str(overlay_path),
                json_url=clean_url_for_db(web_json_url),
                vis_url=clean_url_for_db(web_overlay_url) 
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
            "tool": "SnakeActiveContour",
            "json_path": json_path,
            "json_url": web_json_url,
            "overlay_url": web_overlay_url,
            "mask_url": web_mask_url,
            "contour_points": (data.get("output") or {}).get("contour_points_xy"),
            "iterations": (data.get("output") or {}).get("iterations"),
            "db_record_id": record_id
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Snake failed: {str(e)}")