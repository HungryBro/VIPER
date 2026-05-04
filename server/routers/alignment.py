# server/routers/alignment.py
import os
import cv2
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..utils_io import resolve_image_path, OUT, static_url
from ..database import get_db
from .. import models

from server.algos.ObjectAlignment.homography_alignment_adapter import run as homography_run
from server.algos.ObjectAlignment.AffineTransformEstimation import run as affine_run

router = APIRouter()

BASE_URL = "http://localhost:8000"

def clean_url_for_db(u: str) -> Optional[str]:
    if not u: 
        return None
    normalized = os.path.normpath(u)
    normalized = normalized.replace("\\", "/")
    normalized = normalized.lstrip("/")
    return f"{BASE_URL}/{normalized}"

class HomographyReq(BaseModel):
    match_json: str
    warp_mode: Optional[str] = "image2_to_image1"
    blend: Optional[bool] = False

class AffineReq(BaseModel):
    match_json: str
    model: Optional[str] = "affine"
    warp_mode: Optional[str] = "image2_to_image1"
    blend: Optional[bool] = False
    ransac_thresh: Optional[float] = 3.0
    confidence: Optional[float] = 0.99
    refine_iters: Optional[int] = 10

def inject_shape_info(result_dict, out_root):
    try:
        output_data = result_dict.get("output", {})
        rel_path = output_data.get("aligned_image")
        
        if rel_path:
            full_path = os.path.join(out_root, rel_path)
            if os.path.exists(full_path):
                img = cv2.imread(full_path)
                if img is not None:
                    shape = list(img.shape) 
                    if "output" not in result_dict:
                        result_dict["output"] = {}
                    
                    result_dict["output"]["aligned_shape"] = shape
                    result_dict["output"]["shape"] = shape
                    result_dict["image_shape"] = shape
                    result_dict["channels"] = shape[2] if len(shape) > 2 else 1
    except Exception as e:
        print(f"Error reading shape: {e}")
    return result_dict

@router.post("/homography")
def alignment_homography(req: HomographyReq, db: Session = Depends(get_db)):
    match_json_path = resolve_image_path(req.match_json)
    if not os.path.exists(match_json_path):
        raise HTTPException(status_code=404, detail=f"Match JSON not found: {req.match_json}")

    try:
        result = homography_run(
            match_json_path,
            out_root=OUT,
            warp_mode=req.warp_mode,
            blend=req.blend,
        )

        result = inject_shape_info(result, OUT)

        aligned_rel = result.get("output", {}).get("aligned_image")
        aligned_url = static_url(aligned_rel, OUT) if aligned_rel else ""
        json_url = static_url(result.get("json_path"), OUT) if result.get("json_path") else ""
        
        actual_params = result.get("homography_parameters_used", {
            "warp_mode": req.warp_mode,
            "blend": req.blend
        })

        # บันทึกผลลัพธ์ลง PostgreSQL
        try:
            db_result = models.AlgorithmResult(
                node_type="homography_alignment",
                parameters=actual_params,
                json_path=str(result.get("json_path")),
                vis_path=str(aligned_rel),
                json_url=clean_url_for_db(json_url),
                vis_url=clean_url_for_db(aligned_url)
            )
            db.add(db_result)
            db.commit()
            db.refresh(db_result)
            record_id = db_result.id
        except Exception as db_err:
            db.rollback()
            print(f"DB Error (Homography): {db_err}")
            record_id = None

        if aligned_url:
            result["output"]["aligned_url"] = aligned_url
        if json_url:
            result["json_url"] = json_url

        return {
            "status": "success",
            "tool": "HomographyAlignment",
            "output_image": aligned_url,
            "vis_url": aligned_url,
            "db_record_id": record_id,
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Homography failed: {str(e)}")

@router.post("/affine")
def alignment_affine(req: AffineReq, db: Session = Depends(get_db)):
    match_json_path = resolve_image_path(req.match_json)
    if not os.path.exists(match_json_path):
        raise HTTPException(status_code=404, detail=f"Match JSON not found: {req.match_json}")

    try:
        result = affine_run(
            match_json_path=match_json_path,
            out_root=OUT,
            model=req.model,
            warp_mode=req.warp_mode,
            blend=req.blend,
            ransac_thresh=req.ransac_thresh,
            confidence=req.confidence,
            refine_iters=req.refine_iters,
        )

        result = inject_shape_info(result, OUT)

        aligned_rel = result.get("output", {}).get("aligned_image")
        aligned_url = static_url(aligned_rel, OUT) if aligned_rel else ""
        json_url = static_url(result.get("json_path"), OUT) if result.get("json_path") else ""
        
        actual_params = result.get("affine_parameters_used", {
            "model": req.model,
            "warp_mode": req.warp_mode,
            "ransac_thresh": req.ransac_thresh
        })

     
        try:
            db_result = models.AlgorithmResult(
                node_type="affine_alignment",
                parameters=actual_params,
                json_path=str(result.get("json_path")),
                vis_path=str(aligned_rel),
                json_url=clean_url_for_db(json_url),
                vis_url=clean_url_for_db(aligned_url)
            )
            db.add(db_result)
            db.commit()
            db.refresh(db_result)
            record_id = db_result.id
        except Exception as db_err:
            db.rollback()
            record_id = None

        if aligned_url:
            result["output"]["aligned_url"] = aligned_url
        if json_url:
            result["json_url"] = json_url
            
        return {
            "status": "success",
            "tool": "AffineAlignment",
            "output_image": aligned_url,
            "vis_url": aligned_url,
            "db_record_id": record_id,
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Affine failed: {str(e)}")