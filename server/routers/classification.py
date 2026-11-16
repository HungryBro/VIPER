# server/routers/classification.py
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..utils_io import OUT, read_json, static_url
from ..database import get_db
from ..processing import failures_as, public_url, record_result, require_file

from server.algos.Classification.otsu_adapter import run as otsu_run
from server.algos.Classification.snake_adapter import run as snake_run

router = APIRouter()

class OtsuReq(BaseModel):
    image_path: str
    gaussian_blur: Optional[bool] = False
    blur_ksize: Optional[int] = 5
    invert: Optional[bool] = False
    morph_open: Optional[bool] = False
    morph_close: Optional[bool] = False
    morph_kernel: Optional[int] = 3
    show_histogram: Optional[bool] = False

class SnakeReq(BaseModel):
    image_path: str
    alpha: float = 0.2
    beta: float = 0.2
    gamma: float = 0.1
    w_line: float = 0.0
    w_edge: float = 1.0
    max_iterations: int = 250
    convergence: float = 0.001
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
    gaussian_blur_ksize: int = 0


@router.post("/otsu")
def classify_otsu(req: OtsuReq, db: Session = Depends(get_db)):
    img_path = require_file(req.image_path, "Image not found")

    with failures_as(400, "Otsu failed: "):
        json_path, bin_path = otsu_run(
            image_path=img_path,
            out_root=OUT,
            gaussian_blur=req.gaussian_blur,
            blur_ksize=req.blur_ksize,
            invert=req.invert,
            morph_open=req.morph_open,
            morph_close=req.morph_close,
            morph_kernel=req.morph_kernel,
            show_histogram=req.show_histogram,
        )
        
        data = read_json(json_path)
        actual_params = data.get("otsu_parameters_used", req.model_dump(exclude={"image_path"}))
        
        web_json_url = static_url(json_path)
        web_bin_url = static_url(bin_path) if bin_path else None
        web_hist_url = static_url(data.get("output", {}).get("histogram_path")) if data.get("output") else None

        # บันทึกผลลัพธ์ลง PostgreSQL
        record_id = record_result(
            db, "otsu_threshold", actual_params,
            json_path=str(json_path),
            vis_path=str(bin_path) if bin_path else None,
            json_url=public_url(web_json_url),
            vis_url=public_url(web_bin_url),
        )

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


@router.post("/snake")
def classify_snake(req: SnakeReq, db: Session = Depends(get_db)):
    img_path = require_file(req.image_path, "Image not found")

    with failures_as(400, "Snake failed: "):
        params = req.model_dump(exclude={"image_path"})
        json_path, overlay_path, mask_path = snake_run(
            image_path=img_path,
            out_root=OUT,
            **params
        )

        data = read_json(json_path)
        actual_params = data.get("snake_parameters_used", params)
        
        web_json_url = static_url(json_path)
        web_overlay_url = static_url(overlay_path)
        web_mask_url = static_url(mask_path)

        # บันทึกผลลัพธ์ลง PostgreSQL
        record_id = record_result(
            db, "snake_active_contour", actual_params,
            json_path=str(json_path),
            vis_path=str(overlay_path),
            json_url=public_url(web_json_url),
            vis_url=public_url(web_overlay_url),
        )

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
