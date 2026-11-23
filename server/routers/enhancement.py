# server/routers/enhancement.py
import os
import json
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..utils_io import resolve_image_path, OUT, static_url

from server.algos.enchancement.Clahe import run as clahe_run
from server.algos.enchancement.Msrcr import run as msrcr_run
from server.algos.enchancement.Zero import run as zero_run

router = APIRouter()

class EnhancementReq(BaseModel):
    image_path: str 
    params: Optional[dict] = None

def extract_shape(json_data):
   
    img_data = json_data.get('image', {})
    shape = img_data.get('processed_shape') or img_data.get('shape') or img_data.get('original_shape')
    
    if not shape:
        shape = json_data.get('output', {}).get('shape')
        
    return shape


@router.post("/clahe")
async def api_clahe(req: EnhancementReq):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        json_p, vis_p = clahe_run(img_path, OUT, **(req.params or {}))
        
        with open(json_p, 'r', encoding='utf-8') as f:
            json_content = json.load(f)

        shape = extract_shape(json_content)

        return {
            "status": "success",
            "tool": "CLAHE",
            "json_url": static_url(json_p),
            "vis_url": static_url(vis_p),
            "image_shape": shape,  
            "json_data": json_content 
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/msrcr")
async def api_msrcr(req: EnhancementReq):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail=f"Image not found at: {img_path}")

    try:
        json_p, vis_p = msrcr_run(img_path, OUT, **(req.params or {}))
        
        with open(json_p, 'r', encoding='utf-8') as f:
            json_content = json.load(f)
            
        shape = extract_shape(json_content)

        return {
            "status": "success",
            "tool": "MSRCR",
            "json_url": static_url(json_p),
            "vis_url": static_url(vis_p),
            "image_shape": shape,
            "json_data": json_content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/zero_dce")
async def api_zero_dce(req: EnhancementReq):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        json_p, vis_p = zero_run(img_path, OUT, **(req.params or {}))
        
        with open(json_p, 'r', encoding='utf-8') as f:
            json_content = json.load(f)

        shape = extract_shape(json_content)

        return {
            "status": "success",
            "tool": "ZERO_DCE",
            "json_url": static_url(json_p),
            "vis_url": static_url(vis_p),
            "image_shape": shape,
            "json_data": json_content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))