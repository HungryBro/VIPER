# server/routers/segmentation.py
import os
import json 
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..utils_io import resolve_image_path, OUT, static_url



from server.algos.segmentation.DeepLabv3 import run as deeplab_run
from server.algos.segmentation.UNET import run as unet_run
from server.algos.segmentation.MaskRNN import run as maskrcnn_run

router = APIRouter()

class SegReq(BaseModel):
    image_path: str
    model_path: Optional[str] = None 
    params: Optional[dict] = None

def load_output_json(json_path):
    if os.path.exists(json_path):
        with open(json_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


@router.post("/deeplab")
async def api_deeplab(req: SegReq):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        json_p, mask_p, vis_p = deeplab_run(img_path, OUT, model_path=req.model_path, **(req.params or {}))
        
        return {
            "status": "success",
            "tool": "DeepLabv3",
            "json_url": static_url(json_p),
            "vis_url": static_url(vis_p) if vis_p else None,
            "mask_url": static_url(mask_p) if mask_p else None, 
            "json_data": load_output_json(json_p)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DeepLab Error: {str(e)}")

@router.post("/unet")
async def api_unet(req: SegReq):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        json_p, mask_p, vis_p = unet_run(img_path, OUT, model_path=req.model_path, **(req.params or {}))
        
        return {
            "status": "success",
            "tool": "U-Net",
            "json_url": static_url(json_p),
            "vis_url": static_url(vis_p) if vis_p else None,
            "mask_url": static_url(mask_p) if mask_p else None,
            "json_data": load_output_json(json_p)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"U-Net Error: {str(e)}")

@router.post("/maskrcnn")
async def api_maskrcnn(req: SegReq):
    img_path = resolve_image_path(req.image_path)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        json_p, mask_p, vis_p = maskrcnn_run(img_path, OUT, model_path=req.model_path, **(req.params or {}))
        
        return {
            "status": "success",
            "tool": "MaskRCNN",
            "json_url": static_url(json_p),
            "vis_url": static_url(vis_p) if vis_p else None,
            "mask_url": static_url(mask_p) if mask_p else None,
            "json_data": load_output_json(json_p)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mask R-CNN Error: {str(e)}")