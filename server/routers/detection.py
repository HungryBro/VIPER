from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..utils_io import OUT, RESULT_DIR, resolve_image_path, static_url
from ..algos.detection import dataset_builder, yolo_adapter


router = APIRouter()


class YOLOTrainReq(BaseModel):
    dataset_yaml: str
    epochs: int = Field(default=50, ge=1)
    image_size: int = Field(default=640, ge=32)
    batch: int = Field(default=16, ge=1)
    device: Optional[str] = None
    run_name: Optional[str] = None


class YOLOAnnotation(BaseModel):
    class_id: int = Field(ge=0)
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    width: float = Field(gt=0.0, le=1.0)
    height: float = Field(gt=0.0, le=1.0)


class YOLODatasetImage(BaseModel):
    image_path: str
    annotations: list[YOLOAnnotation] = Field(default_factory=list)


class YOLODatasetReq(BaseModel):
    images: list[YOLODatasetImage] = Field(min_length=2)
    class_names: list[str] = Field(min_length=1)
    name: Optional[str] = None
    validation_split: float = Field(default=0.2, gt=0.0, lt=1.0)


class YOLODetectReq(BaseModel):
    image_path: str
    # Only populated when a trained model is connected from YOLO Train.
    model_path: Optional[str] = None
    confidence: float = Field(default=0.25, ge=0.0, le=1.0)
    iou: float = Field(default=0.7, ge=0.0, le=1.0)
    image_size: int = Field(default=640, ge=32)
    device: Optional[str] = None


class YOLOGradCAMReq(BaseModel):
    image_path: str
    # Only populated when a trained model is connected from YOLO Train.
    model_path: Optional[str] = None
    method: Literal["GradCAM", "GradCAMPlusPlus", "EigenCAM", "LayerCAM"] = "GradCAM"
    target_layers: Optional[list[int]] = None
    confidence: float = Field(default=0.2, ge=0.0, le=1.0)
    target_class_ids: Optional[list[int]] = None
    device: Optional[str] = None


def _urls(payload: dict, fields: dict[str, str]) -> dict:
    result = dict(payload)
    for path_field, url_field in fields.items():
        result[url_field] = static_url(payload.get(path_field), OUT)
    if payload.get("json_path"):
        result["json_url"] = static_url(payload["json_path"], OUT)
    return result


@router.post("/dataset")
def create_yolo_dataset(req: YOLODatasetReq):
    try:
        images = [
            {
                "image_path": resolve_image_path(image.image_path),
                "annotations": [box.model_dump() for box in image.annotations],
            }
            for image in req.images
        ]
        return _urls(
            dataset_builder.build_dataset(
                images=images,
                class_names=req.class_names,
                out_root=RESULT_DIR,
                name=req.name,
                validation_split=req.validation_split,
            ),
            {"dataset_yaml": "dataset_yaml_url"},
        )
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/train")
def train_yolo(req: YOLOTrainReq):
    try:
        return _urls(
            yolo_adapter.train(
                dataset_yaml=req.dataset_yaml,
                out_root=RESULT_DIR,
                epochs=req.epochs,
                image_size=req.image_size,
                batch=req.batch,
                device=req.device,
                run_name=req.run_name,
            ),
            {},
        )
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/detect")
def detect_yolo(req: YOLODetectReq):
    try:
        return _urls(
            yolo_adapter.detect(
                image_path=resolve_image_path(req.image_path),
                out_root=RESULT_DIR,
                model_path=req.model_path or yolo_adapter.DEFAULT_MODEL,
                confidence=req.confidence,
                iou=req.iou,
                image_size=req.image_size,
                device=req.device,
            ),
            {"output_image_path": "output_image_url"},
        )
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gradcam")
def gradcam_yolo(req: YOLOGradCAMReq):
    try:
        return _urls(
            yolo_adapter.gradcam(
                image_path=resolve_image_path(req.image_path),
                out_root=RESULT_DIR,
                model_path=req.model_path or yolo_adapter.DEFAULT_MODEL,
                method=req.method,
                target_layers=req.target_layers,
                confidence=req.confidence,
                target_class_ids=req.target_class_ids,
                device=req.device,
            ),
            {"overlay_path": "overlay_url", "heatmap_path": "heatmap_url"},
        )
    except (FileNotFoundError, ValueError, RuntimeError, IndexError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
