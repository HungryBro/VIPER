"""HTTP endpoints for the Evaluation nodes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from server.algos.evaluation import evaluate_classification
from server.algos.evaluation.detection_evaluator import evaluate_yolo_dataset
from server.algos.evaluation.yolo_classification_evaluator import evaluate_yolo_test_image
from server.utils_io import OUT, RESULT_DIR, resolve_image_path, static_url


router = APIRouter()


class ClassificationEvaluationReq(BaseModel):
    """Predictions and labels supplied by a Classification Evaluation node."""

    y_true: list[Any] = Field(min_length=1)
    y_pred: list[Any] = Field(min_length=1)
    y_scores: list[Any] | None = None
    class_names: list[str] | None = None


class DetectionEvaluationReq(BaseModel):
    dataset_yaml: str = Field(min_length=1)
    model_path: str = Field(min_length=1)
    confidence_threshold: float = Field(default=0.25, ge=0.0, le=1.0)
    iou_threshold: float = Field(default=0.5, gt=0.0, le=1.0)
    nms_iou_threshold: float = Field(default=0.7, gt=0.0, le=1.0)
    image_size: int = Field(default=640, ge=32)
    device: str | None = None


class YOLOAnnotation(BaseModel):
    class_id: int = Field(ge=0)
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    width: float = Field(gt=0.0, le=1.0)
    height: float = Field(gt=0.0, le=1.0)


class YOLOClassificationEvaluationReq(BaseModel):
    image_path: str = Field(min_length=1)
    model_path: str = Field(min_length=1)
    class_names: list[str] = Field(min_length=1)
    annotations: list[YOLOAnnotation] = Field(min_length=1)
    confidence_threshold: float = Field(default=0.25, ge=0.0, le=1.0)
    iou_threshold: float = Field(default=0.5, gt=0.0, le=1.0)
    nms_iou_threshold: float = Field(default=0.7, gt=0.0, le=1.0)
    image_size: int = Field(default=640, ge=32)
    device: str | None = None


@router.post("/classification")
def classification_evaluation(req: ClassificationEvaluationReq) -> dict[str, Any]:
    """Return confusion-matrix metrics and optional ROC/AUC data."""

    try:
        result = evaluate_classification(
            req.y_true,
            req.y_pred,
            y_scores=req.y_scores,
            class_names=req.class_names,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return {
        "status": "success",
        "tool": "ClassificationEvaluation",
        **result,
    }


@router.post("/classification/yolo")
def yolo_classification_evaluation(req: YOLOClassificationEvaluationReq) -> dict[str, Any]:
    """Evaluate classes on one labelled Test Image from the connected YOLO flow."""
    try:
        result = evaluate_yolo_test_image(
            image_path=resolve_image_path(req.image_path),
            model_path=req.model_path,
            class_names=req.class_names,
            annotations=[annotation.model_dump() for annotation in req.annotations],
            out_root=RESULT_DIR,
            confidence_threshold=req.confidence_threshold,
            iou_threshold=req.iou_threshold,
            nms_iou_threshold=req.nms_iou_threshold,
            image_size=req.image_size,
            device=req.device,
        )
        result["json_url"] = static_url(result["json_path"], OUT)
        return result
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/detection")
def detection_evaluation(req: DetectionEvaluationReq) -> dict[str, Any]:
    """Evaluate a trained YOLO model against a Dataset Builder validation split."""
    try:
        result = evaluate_yolo_dataset(
            dataset_yaml=req.dataset_yaml,
            model_path=req.model_path,
            out_root=RESULT_DIR,
            confidence_threshold=req.confidence_threshold,
            iou_threshold=req.iou_threshold,
            nms_iou_threshold=req.nms_iou_threshold,
            image_size=req.image_size,
            device=req.device,
        )
        result["json_url"] = static_url(result["json_path"], OUT)
        return result
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
