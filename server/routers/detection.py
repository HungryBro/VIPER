from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock
from typing import Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..utils_io import OUT, RESULT_DIR, resolve_image_path, static_url
from ..algos.detection import dataset_builder, yolo_adapter


router = APIRouter()

# Training can take minutes on a CPU.  Keep it off the request thread and let
# the canvas poll a small status object for real epoch progress.
_training_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="viper-yolo-train")
_training_jobs: dict[str, dict] = {}
_training_jobs_lock = Lock()


def _update_training_job(training_job_id: str, **changes: object) -> None:
    with _training_jobs_lock:
        _training_jobs.setdefault(training_job_id, {}).update(changes)


def _training_job_snapshot(job_id: str) -> dict | None:
    with _training_jobs_lock:
        job = _training_jobs.get(job_id)
        return dict(job) if job is not None else None


def _run_training_job(job_id: str, request: "YOLOTrainReq") -> None:
    def is_cancel_requested() -> bool:
        return bool((_training_job_snapshot(job_id) or {}).get("cancel_requested"))

    def report_progress(current_epoch: int, total_epochs: int) -> None:
        completed = min(max(current_epoch, 0), total_epochs)
        canceling = is_cancel_requested()
        _update_training_job(
            job_id,
            status="running",
            current_epoch=completed,
            total_epochs=total_epochs,
            progress=round((completed / total_epochs) * 100, 1) if total_epochs else 0.0,
            message="Canceling after the current batch…" if canceling else f"Training epoch {completed} of {total_epochs}",
        )

    _update_training_job(job_id, status="running", message="Preparing the training run…")
    try:
        result = yolo_adapter.train(
            dataset_yaml=request.dataset_yaml,
            out_root=RESULT_DIR,
            model_path=request.model_path,
            epochs=request.epochs,
            image_size=request.image_size,
            batch=request.batch,
            device=request.device,
            run_name=request.run_name,
            on_progress=report_progress,
            should_cancel=is_cancel_requested,
        )
    except yolo_adapter.TrainingCanceled:
        _update_training_job(job_id, status="canceled", message="Training canceled")
        return
    except Exception as exc:
        _update_training_job(job_id, status="fault", message=str(exc), error=str(exc))
        return

    _update_training_job(
        job_id,
        status="success",
        current_epoch=request.epochs,
        total_epochs=request.epochs,
        progress=100.0,
        message="Training completed",
        result=_urls(result, {}),
    )


@router.get("/models")
def list_yolo_models() -> dict[str, list[dict[str, str]]]:
    """List bundled YOLO weights as project-relative paths for the UI."""
    models_dir = (yolo_adapter.PROJECT_ROOT / "models").resolve()
    models: list[dict[str, str]] = []
    if models_dir.is_dir():
        for path in sorted(models_dir.rglob("*.pt")):
            resolved = path.resolve()
            if resolved.is_file() and resolved.is_relative_to(models_dir):
                models.append({"path": resolved.relative_to(yolo_adapter.PROJECT_ROOT).as_posix(), "name": path.name})
    return {"models": models}


class YOLOTrainReq(BaseModel):
    dataset_yaml: str
    model_path: str = yolo_adapter.DEFAULT_MODEL
    epochs: int = Field(default=50, ge=1)
    image_size: int = Field(default=640, ge=32)
    batch: int = Field(default=16, ge=1)
    device: Optional[str] = None
    run_name: Optional[str] = None


@router.post("/train/start")
def start_yolo_train(req: YOLOTrainReq):
    job_id = uuid4().hex
    _update_training_job(
        job_id,
        job_id=job_id,
        status="queued",
        current_epoch=0,
        total_epochs=req.epochs,
        progress=0.0,
        message="Waiting to start…",
    )
    _training_executor.submit(_run_training_job, job_id, req)
    return _training_job_snapshot(job_id)


@router.get("/train/jobs/{job_id}")
def get_yolo_training_job(job_id: str):
    job = _training_job_snapshot(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Training job not found")
    return job


@router.post("/train/jobs/{job_id}/cancel")
def cancel_yolo_training_job(job_id: str):
    job = _training_job_snapshot(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Training job not found")
    if job.get("status") in {"success", "fault", "canceled"}:
        return job
    _update_training_job(job_id, cancel_requested=True, message="Canceling after the current batch…")
    return _training_job_snapshot(job_id)


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
    class_ids: Optional[list[int]] = None
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
                model_path=req.model_path,
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
                class_ids=req.class_ids,
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
