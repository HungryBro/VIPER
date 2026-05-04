# server/routers/features.py
import os
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..utils_io import resolve_image_path, OUT, RESULT_DIR, _read_json, static_url
from ..database import get_db
from .. import models

from server.algos.feature.sift_adapter import run as sift_run
from server.algos.feature.orb_adapter import run as orb_run
from server.algos.feature.surf_adapter import run as surf_run

router = APIRouter()

BASE_URL = "http://localhost:8000"

class FeatureReq(BaseModel):
    image_path: str
    params: Optional[dict] = None

@router.post("/sift")
def feature_sift(req: FeatureReq, db: Session = Depends(get_db)):
    img_path = resolve_image_path(req.image_path)
    try:
        params = req.params or {}
        json_path, vis_path = sift_run(img_path, RESULT_DIR, **params)
        data = _read_json(json_path) 
        
        actual_params = data.get("sift_parameters_used", params)
        
        web_json_url = static_url(json_path, OUT)
        web_vis_url = static_url(vis_path, OUT) if vis_path and os.path.exists(vis_path) else None

        try:
            db_result = models.AlgorithmResult(
                node_type="sift",
                parameters=actual_params, 
                json_path=str(json_path),
                vis_path=str(vis_path) if vis_path else None,
                json_url=f"{BASE_URL}{web_json_url}" if web_json_url else None,
                vis_url=f"{BASE_URL}{web_vis_url}" if web_vis_url else None
            )
            db.add(db_result)
            db.commit()
            db.refresh(db_result)
            record_id = db_result.id
        except Exception as db_err:
            db.rollback()
            print(f"DB Error (SIFT): {db_err}")
            record_id = None

        return {
            "status": "success",
            "tool": "SIFT",
            "num_keypoints": data.get("num_keypoints"),
            "descriptor_dim": data.get("descriptor_dim"),
            "json_url": web_json_url,
            "vis_url": web_vis_url,
            "json_data": data,
            "db_record_id": record_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/orb")
def feature_orb(req: FeatureReq, db: Session = Depends(get_db)):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")
    try:
        params = req.params or {}
        json_path, vis_path = orb_run(img_path, RESULT_DIR, **params)
        data = _read_json(json_path)
        
        actual_params = data.get("orb_parameters_used", params)
        
        web_json_url = static_url(json_path, OUT)
        web_vis_url = static_url(vis_path, OUT) if vis_path and os.path.exists(vis_path) else None

        try:
            db_result = models.AlgorithmResult(
                node_type="orb",
                parameters=actual_params, 
                json_path=str(json_path),
                vis_path=str(vis_path) if vis_path else None,
                json_url=f"{BASE_URL}{web_json_url}" if web_json_url else None,
                vis_url=f"{BASE_URL}{web_vis_url}" if web_vis_url else None
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
            "tool": "ORB",
            "num_keypoints": data.get("num_keypoints"),
            "descriptor_dim": data.get("descriptor_dim"),
            "json_url": web_json_url,
            "vis_url": web_vis_url,
            "json_data": data,
            "db_record_id": record_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/surf")
def feature_surf(req: FeatureReq, db: Session = Depends(get_db)):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")
    try:
        params = req.params or {}
        json_path, vis_path = surf_run(img_path, RESULT_DIR, **params)
        data = _read_json(json_path)
        
        actual_params = data.get("surf_parameters_used", params)
        
        web_json_url = static_url(json_path, OUT)
        web_vis_url = static_url(vis_path, OUT) if vis_path and os.path.exists(vis_path) else None

        try:
            db_result = models.AlgorithmResult(
                node_type="surf",
                parameters=actual_params, 
                json_path=str(json_path),
                vis_path=str(vis_path) if vis_path else None,
                json_url=f"{BASE_URL}{web_json_url}" if web_json_url else None,
                vis_url=f"{BASE_URL}{web_vis_url}" if web_vis_url else None
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
            "tool": "SURF",
            "num_keypoints": data.get("num_keypoints"),
            "descriptor_dim": data.get("descriptor_dim"),
            "json_url": web_json_url,
            "vis_url": web_vis_url,
            "json_data": data,
            "db_record_id": record_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))