# server/routers/matching.py
import os
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from ..utils_io import resolve_image_path, OUT, static_url
from ..database import get_db
from .. import models

from server.algos.matching.bfmatcher_adapter import run as bf_run
from server.algos.matching.flannmatcher_adapter import run as flann_run

router = APIRouter()

BASE_URL = "http://localhost:8000"

def _as_count(x) -> int:
    if isinstance(x, list):
        return len(x)
    try:
        return int(x)
    except (TypeError, ValueError):
        return 0

def clean_url_for_db(u: str) -> Optional[str]:
    if not u: 
        return None
    normalized = os.path.normpath(u)
    normalized = normalized.replace("\\", "/")
    normalized = normalized.lstrip("/")
    
    return f"{BASE_URL}/{normalized}"

class MatchReq(BaseModel):
    model_config = ConfigDict(extra="ignore")

    json_a: str
    json_b: str
    norm_type: Optional[str] = None
    cross_check: Optional[bool] = None
    lowe_ratio: Optional[float] = None
    ransac_thresh: Optional[float] = 5.0
    draw_mode: Optional[str] = "good"
    max_draw: Optional[int] = 50
    index_mode: Optional[str] = "AUTO"
    kd_trees: Optional[int] = 5
    search_checks: Optional[int] = 50
    lsh_table_number: Optional[int] = 6
    lsh_key_size: Optional[int] = 12
    lsh_multi_probe_level: Optional[int] = 1

@router.post("/bf")
def match_bf(req: MatchReq, db: Session = Depends(get_db)):
    json_a_path = resolve_image_path(req.json_a)
    json_b_path = resolve_image_path(req.json_b)

    try:
        result = bf_run(
            json_a_path, json_b_path, OUT,
            lowe_ratio=req.lowe_ratio,
            ransac_thresh=req.ransac_thresh,
            norm_override=req.norm_type,
            cross_check=req.cross_check,
            draw_mode=req.draw_mode,
        )
        
        stats = result.get("matching_statistics", {})
        inliers = int(result.get("inliers", 0))
        good_cnt = _as_count(result.get("good_matches", stats.get("num_good_matches", 0)))
        actual_params = result.get("bfmatcher_parameters_used", {})
        
        web_json_url = static_url(result.get("json_path"), OUT)
        web_vis_url = static_url(result.get("vis_url"), OUT)

        try:
            db_result = models.AlgorithmResult(
                node_type="bf_match",
                parameters=actual_params,
                json_path=str(result.get("json_path")),
                vis_path=str(result.get("vis_url")),
                json_url=clean_url_for_db(web_json_url),
                vis_url=clean_url_for_db(web_vis_url)
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
            "tool": "BFMatcher",
            "description": stats.get("summary") or f"{inliers} inliers / {good_cnt} matches",
            "matching_statistics": stats,
            "vis_url": web_vis_url,
            "json_url": web_json_url,
            "json_path": result.get("json_path"),
            "inputs": result.get("inputs", {}),
            "input_features_details": result.get("input_features_details", {}),
            "db_record_id": record_id
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"BF Matcher failed: {str(e)}")

@router.post("/flann")
def match_flann(req: MatchReq, db: Session = Depends(get_db)):
    json_a_path = resolve_image_path(req.json_a)
    json_b_path = resolve_image_path(req.json_b)

    try:
        result = flann_run(
            json_a_path, json_b_path, OUT,
            lowe_ratio=req.lowe_ratio,       
            ransac_thresh=req.ransac_thresh,
            index_mode=req.index_mode,
            kd_trees=req.kd_trees,
            search_checks=req.search_checks,
            lsh_table_number=req.lsh_table_number,
            lsh_key_size=req.lsh_key_size,
            lsh_multi_probe_level=req.lsh_multi_probe_level,
            draw_mode=req.draw_mode,
            max_draw=req.max_draw,
        )

        stats = result.get("matching_statistics", {})
        actual_params = result.get("flann_parameters_used", {})
        
        web_json_url = static_url(result.get("json_path"), OUT)
        web_vis_url = static_url(result.get("vis_url"), OUT)

        try:
            db_result = models.AlgorithmResult(
                node_type="flann_match",
                parameters=actual_params,
                json_path=str(result.get("json_path")),
                vis_path=str(result.get("vis_url")),
                json_url=clean_url_for_db(web_json_url),
                vis_url=clean_url_for_db(web_vis_url)
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
            "tool": "FLANNBasedMatcher",
            "description": stats.get("summary") or "FLANN Matching completed",
            "matching_statistics": stats,
            "vis_url": web_vis_url,
            "json_url": web_json_url,
            "json_path": result.get("json_path"),
            "inputs": result.get("inputs", {}),
            "input_features_details": result.get("input_features_details", {}),
            "db_record_id": record_id
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"FLANN Matcher failed: {str(e)}")
