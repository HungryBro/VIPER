# server/routers/alignment.py
import os
import cv2
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..utils_io import OUT, static_url
from ..database import get_db
from ..processing import failures_as, public_url, record_result, require_file

from server.algos.ObjectAlignment.homography_alignment_adapter import run as homography_run
from server.algos.ObjectAlignment.AffineTransformEstimation import run as affine_run

router = APIRouter()

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


def _alignment_response(db: Session, tool: str, node_type: str, result: dict, parameters: dict) -> dict:
    """Record an alignment run and build the response both alignment endpoints return."""
    result = inject_shape_info(result, OUT)

    aligned_rel = result.get("output", {}).get("aligned_image")
    aligned_url = static_url(aligned_rel) if aligned_rel else ""
    json_url = static_url(result.get("json_path")) if result.get("json_path") else ""

    record_id = record_result(
        db, node_type, parameters,
        json_path=str(result.get("json_path")),
        vis_path=str(aligned_rel),
        json_url=public_url(json_url),
        vis_url=public_url(aligned_url),
    )

    if aligned_url:
        result["output"]["aligned_url"] = aligned_url
    if json_url:
        result["json_url"] = json_url

    return {
        "status": "success",
        "tool": tool,
        "output_image": aligned_url,
        "vis_url": aligned_url,
        "db_record_id": record_id,
        **result
    }


@router.post("/homography")
def alignment_homography(req: HomographyReq, db: Session = Depends(get_db)):
    match_json_path = require_file(req.match_json, f"Match JSON not found: {req.match_json}")

    with failures_as(400, "Homography failed: "):
        result = homography_run(
            match_json_path,
            out_root=OUT,
            warp_mode=req.warp_mode,
            blend=req.blend,
        )
        return _alignment_response(db, "HomographyAlignment", "homography_alignment", result, result.get("homography_parameters_used", {
            "warp_mode": req.warp_mode,
            "blend": req.blend
        }))

@router.post("/affine")
def alignment_affine(req: AffineReq, db: Session = Depends(get_db)):
    match_json_path = require_file(req.match_json, f"Match JSON not found: {req.match_json}")

    with failures_as(400, "Affine failed: "):
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
        return _alignment_response(db, "AffineAlignment", "affine_alignment", result, result.get("affine_parameters_used", {
            "model": req.model,
            "warp_mode": req.warp_mode,
            "ransac_thresh": req.ransac_thresh
        }))
