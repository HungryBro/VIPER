"""Ultralytics YOLO train, inference, and Grad-CAM adapters.

Heavy ML dependencies are imported inside the public functions so the rest of
VIPER can start and be tested on machines that do not have a GPU environment.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Iterable, Optional

import numpy as np


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MODEL = "yolo11n.pt"


def _require_file(value: str, label: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(f"{label} not found: {path}")
    return path


def _resolve_model(value: str) -> str:
    """Resolve local weights or keep an Ultralytics model alias unchanged."""
    model_value = (value or DEFAULT_MODEL).strip()
    candidate = Path(model_value).expanduser()
    is_path = candidate.is_absolute() or len(candidate.parts) > 1
    if is_path:
        if not candidate.is_absolute():
            candidate = PROJECT_ROOT / candidate
        candidate = candidate.resolve()
        if not candidate.is_file():
            raise FileNotFoundError(f"YOLO model not found: {candidate}")
        return str(candidate)

    project_model = (PROJECT_ROOT / "models" / "detection" / candidate.name).resolve()
    if project_model.is_file():
        return str(project_model)
    if candidate.suffix.lower() not in {".pt", ".yaml", ".yml"}:
        raise ValueError(
            "Model must be a local path or an Ultralytics .pt/.yaml model alias"
        )
    return model_value


def _output_dir(out_root: str | Path, operation: str) -> Path:
    path = Path(out_root) / "detection" / operation
    path.mkdir(parents=True, exist_ok=True)
    return path


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_yolo(model_path: str):
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise RuntimeError(
            "Ultralytics is not installed. Run: pip install -r requirements.txt"
        ) from exc
    return YOLO(model_path)


def train(
    dataset_yaml: str,
    out_root: str,
    *,
    epochs: int = 50,
    image_size: int = 640,
    batch: int = 16,
    device: Optional[str] = None,
    run_name: Optional[str] = None,
) -> dict[str, Any]:
    dataset = _require_file(dataset_yaml, "Dataset YAML")
    weights = _resolve_model(DEFAULT_MODEL)
    project = _output_dir(out_root, "train")
    name = run_name or f"train_{uuid.uuid4().hex[:8]}"

    model = _load_yolo(weights)
    kwargs: dict[str, Any] = {
        "data": str(dataset),
        "epochs": epochs,
        "imgsz": image_size,
        "batch": batch,
        "project": str(project),
        "name": name,
        "exist_ok": False,
    }
    if device:
        kwargs["device"] = device
    result = model.train(**kwargs)

    save_dir = Path(getattr(result, "save_dir", project / name)).resolve()
    best_weight = save_dir / "weights" / "best.pt"
    last_weight = save_dir / "weights" / "last.pt"
    summary = {
        "status": "success",
        "tool": "YOLOTrain",
        "dataset_yaml": str(dataset),
        "base_model": weights,
        "run_dir": str(save_dir),
        "best_model_path": str(best_weight) if best_weight.exists() else None,
        "last_model_path": str(last_weight) if last_weight.exists() else None,
        "parameters": {
            "epochs": epochs,
            "image_size": image_size,
            "batch": batch,
            "device": device,
        },
    }
    json_path = save_dir / "viper_train_result.json"
    save_dir.mkdir(parents=True, exist_ok=True)
    _write_json(json_path, summary)
    summary["json_path"] = str(json_path)
    return summary


def detect(
    image_path: str,
    out_root: str,
    model_path: str = DEFAULT_MODEL,
    *,
    confidence: float = 0.25,
    iou: float = 0.7,
    image_size: int = 640,
    device: Optional[str] = None,
) -> dict[str, Any]:
    import cv2

    image = _require_file(image_path, "Input image")
    weights = _resolve_model(model_path)
    model = _load_yolo(weights)
    kwargs: dict[str, Any] = {
        "source": str(image),
        "conf": confidence,
        "iou": iou,
        "imgsz": image_size,
        "verbose": False,
    }
    if device:
        kwargs["device"] = device
    results = model.predict(**kwargs)
    if not results:
        raise RuntimeError("YOLO returned no inference result")

    result = results[0]
    output_dir = _output_dir(out_root, "predict")
    stem = f"{image.stem}_{uuid.uuid4().hex[:8]}"
    image_out = output_dir / f"{stem}.jpg"
    json_out = output_dir / f"{stem}.json"
    if not cv2.imwrite(str(image_out), result.plot()):
        raise RuntimeError(f"Could not write detection image: {image_out}")

    names = getattr(result, "names", getattr(model, "names", {}))
    detections: list[dict[str, Any]] = []
    boxes = getattr(result, "boxes", None)
    if boxes is not None:
        xyxy = boxes.xyxy.detach().cpu().numpy()
        confs = boxes.conf.detach().cpu().numpy()
        classes = boxes.cls.detach().cpu().numpy().astype(int)
        for box, score, class_id in zip(xyxy, confs, classes):
            label = names.get(class_id, str(class_id)) if isinstance(names, dict) else names[class_id]
            detections.append(
                {
                    "class_id": int(class_id),
                    "class_name": str(label),
                    "confidence": float(score),
                    "box_xyxy": [float(value) for value in box],
                }
            )

    payload = {
        "status": "success",
        "tool": "YOLODetect",
        "model_path": weights,
        "image_path": str(image),
        "output_image_path": str(image_out),
        "detections": detections,
        "detection_count": len(detections),
        "parameters": {
            "confidence": confidence,
            "iou": iou,
            "image_size": image_size,
            "device": device,
        },
    }
    _write_json(json_out, payload)
    payload["json_path"] = str(json_out)
    return payload


def heatmap_metrics(
    heatmap: np.ndarray,
    boxes: Iterable[Iterable[float]] = (),
    *,
    activation_threshold: float = 0.6,
) -> dict[str, float]:
    """Measure whether high CAM activation forms a compact detected-object region."""
    import cv2

    cam = np.nan_to_num(np.asarray(heatmap, dtype=np.float32).squeeze())
    cam = np.clip(cam, 0.0, None)
    maximum = float(cam.max()) if cam.size else 0.0
    if maximum <= 0:
        return {
            "heatmap_compactness": 0.0,
            "largest_component_ratio": 0.0,
            "energy_in_boxes": 0.0,
            "active_area_ratio": 0.0,
        }
    cam /= maximum
    active = (cam >= activation_threshold).astype(np.uint8)
    active_pixels = int(active.sum())
    active_area_ratio = active_pixels / float(active.size)

    largest_ratio = 0.0
    if active_pixels:
        count, labels = cv2.connectedComponents(active)
        if count > 1:
            sizes = np.bincount(labels.ravel())[1:]
            largest_ratio = float(sizes.max() / active_pixels)

    height, width = cam.shape
    box_mask = np.zeros_like(cam, dtype=np.uint8)
    for raw_box in boxes:
        x1, y1, x2, y2 = (int(round(float(v))) for v in raw_box)
        x1, x2 = sorted((max(0, min(width, x1)), max(0, min(width, x2))))
        y1, y2 = sorted((max(0, min(height, y1)), max(0, min(height, y2))))
        box_mask[y1:y2, x1:x2] = 1
    total_energy = float(cam.sum())
    energy_in_boxes = float((cam * box_mask).sum() / total_energy) if total_energy else 0.0
    # Reward one dominant hotspot and penalize activation that covers most of
    # the image. When detections exist, also require CAM energy to lie inside
    # their boxes. This is a diagnostic score, not model confidence.
    area_concentration = 1.0 - active_area_ratio
    compactness = (
        (largest_ratio + energy_in_boxes + area_concentration) / 3.0
        if box_mask.any()
        else (largest_ratio + area_concentration) / 2.0
    )
    return {
        "heatmap_compactness": round(compactness, 6),
        "largest_component_ratio": round(largest_ratio, 6),
        "energy_in_boxes": round(energy_in_boxes, 6),
        "active_area_ratio": round(active_area_ratio, 6),
    }


def gradcam(
    image_path: str,
    out_root: str,
    model_path: str = DEFAULT_MODEL,
    *,
    method: str = "GradCAM",
    target_layers: Optional[list[int]] = None,
    confidence: float = 0.2,
    target_class_ids: Optional[list[int]] = None,
    device: Optional[str] = None,
) -> dict[str, Any]:
    image = _require_file(image_path, "Input image")
    weights = _resolve_model(model_path)
    try:
        import cv2
        import torch

        from .gradcam_engine import YOLOHeatmap
    except ImportError as exc:
        raise RuntimeError(
            "Grad-CAM dependencies are not installed. Run: pip install -r requirements.txt"
        ) from exc

    torch_device = torch.device(device) if device else torch.device(
        "cuda:0" if torch.cuda.is_available() else "cpu"
    )
    cam = YOLOHeatmap(
        weight=weights,
        device=torch_device,
        method=method,
        layers=target_layers,
        confidence=confidence,
        ratio=0.1,
        show_boxes=True,
        target_class_ids=target_class_ids,
        target_output_type="class",
    )
    try:
        processed = cam.process(str(image))
    finally:
        cam.release()

    overlay, raw_heatmap, predictions, _ = processed
    output_dir = _output_dir(out_root, "gradcam")
    stem = f"{image.stem}_{uuid.uuid4().hex[:8]}"
    overlay_path = output_dir / f"{stem}_overlay.jpg"
    heatmap_path = output_dir / f"{stem}_heatmap.png"
    json_path = output_dir / f"{stem}.json"
    overlay.save(overlay_path)

    normalized = np.nan_to_num(np.asarray(raw_heatmap, dtype=np.float32).squeeze())
    normalized = np.clip(normalized, 0.0, None)
    if normalized.size and float(normalized.max()) > 0:
        normalized /= float(normalized.max())
    cv2.imwrite(str(heatmap_path), (normalized * 255).astype(np.uint8))

    prediction_array = predictions.detach().cpu().numpy()
    boxes = prediction_array[:, :4].tolist() if prediction_array.size else []
    metrics = heatmap_metrics(normalized, boxes)
    payload = {
        "status": "success",
        "tool": "YOLOGradCAM",
        "model_path": weights,
        "image_path": str(image),
        "overlay_path": str(overlay_path),
        "heatmap_path": str(heatmap_path),
        "detection_count": len(boxes),
        "target_class_ids": target_class_ids,
        "target_layers": cam.layer_indices,
        "method": method,
        **metrics,
    }
    _write_json(json_path, payload)
    payload["json_path"] = str(json_path)
    return payload
