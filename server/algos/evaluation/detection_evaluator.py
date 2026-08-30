"""Run a YOLO model against a validation dataset and calculate VIPER metrics."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

import yaml

from server.algos.detection import yolo_adapter
from server.algos.evaluation.detection_metrics import evaluate_detections


IMAGE_EXTENSIONS = {".bmp", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp"}


def _dataset_config(dataset_yaml: str) -> tuple[Path, Path, Path, dict[int, str]]:
    yaml_path = yolo_adapter._require_file(dataset_yaml, "Dataset YAML")
    try:
        config = yaml.safe_load(yaml_path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise ValueError(f"Could not read Dataset YAML: {exc}") from exc
    if not isinstance(config, dict):
        raise ValueError("Dataset YAML must contain an object")

    root_value = config.get("path")
    if not isinstance(root_value, str) or not root_value.strip():
        raise ValueError("Dataset YAML must contain a dataset path")
    root = Path(root_value).expanduser()
    if not root.is_absolute():
        root = (yaml_path.parent / root).resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"Dataset root not found: {root}")

    val_value = config.get("val")
    if not isinstance(val_value, str) or not val_value.strip():
        raise ValueError("Dataset YAML must contain one validation image directory")
    val_dir = Path(val_value).expanduser()
    if not val_dir.is_absolute():
        val_dir = (root / val_dir).resolve()
    if not val_dir.is_dir():
        raise FileNotFoundError(f"Validation image directory not found: {val_dir}")

    try:
        relative_val = val_dir.relative_to(root)
    except ValueError as exc:
        raise ValueError("Validation image directory must be inside the dataset root") from exc
    parts = list(relative_val.parts)
    if "images" not in parts:
        raise ValueError("Validation image directory must be inside an images directory")
    images_index = parts.index("images")
    labels_dir = root.joinpath(*parts[:images_index], "labels", *parts[images_index + 1:])

    raw_names = config.get("names")
    if isinstance(raw_names, list):
        class_names = {index: str(name) for index, name in enumerate(raw_names)}
    elif isinstance(raw_names, dict):
        try:
            class_names = {int(index): str(name) for index, name in raw_names.items()}
        except (TypeError, ValueError) as exc:
            raise ValueError("Dataset class names must use integer IDs") from exc
    else:
        raise ValueError("Dataset YAML must contain class names")
    if not class_names or any(not name.strip() for name in class_names.values()):
        raise ValueError("Dataset YAML must contain non-empty class names")

    return yaml_path, val_dir, labels_dir, class_names


def _ground_truth_for_image(image_path: Path, image_id: str, label_path: Path) -> list[dict[str, Any]]:
    import cv2

    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"Could not read validation image: {image_path}")
    height, width = image.shape[:2]
    if not label_path.exists():
        return []

    detections: list[dict[str, Any]] = []
    for line_number, line in enumerate(label_path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        values = line.split()
        if len(values) != 5:
            raise ValueError(f"Invalid YOLO label at {label_path}:{line_number}")
        try:
            class_id = int(values[0])
            center_x, center_y, box_width, box_height = (float(value) for value in values[1:])
        except ValueError as exc:
            raise ValueError(f"Invalid YOLO label at {label_path}:{line_number}") from exc
        if class_id < 0 or box_width <= 0 or box_height <= 0 or not all(
            0.0 <= value <= 1.0 for value in (center_x, center_y, box_width, box_height)
        ):
            raise ValueError(f"Invalid YOLO label at {label_path}:{line_number}")
        x1 = (center_x - box_width / 2) * width
        y1 = (center_y - box_height / 2) * height
        x2 = (center_x + box_width / 2) * width
        y2 = (center_y + box_height / 2) * height
        detections.append({"image_id": image_id, "class_id": class_id, "box_xyxy": [x1, y1, x2, y2]})
    return detections


def _predictions_for_image(result: Any, image_id: str) -> list[dict[str, Any]]:
    boxes = getattr(result, "boxes", None)
    if boxes is None:
        return []
    xyxy = boxes.xyxy.detach().cpu().numpy()
    confidences = boxes.conf.detach().cpu().numpy()
    classes = boxes.cls.detach().cpu().numpy().astype(int)
    return [
        {
            "image_id": image_id,
            "class_id": int(class_id),
            "confidence": float(confidence),
            "box_xyxy": [float(value) for value in box],
        }
        for box, confidence, class_id in zip(xyxy, confidences, classes)
    ]


def evaluate_yolo_dataset(
    dataset_yaml: str,
    model_path: str,
    out_root: str | Path,
    *,
    confidence_threshold: float = 0.25,
    iou_threshold: float = 0.5,
    nms_iou_threshold: float = 0.7,
    image_size: int = 640,
    device: str | None = None,
) -> dict[str, Any]:
    """Evaluate a YOLO model against the dataset's validation split."""
    if not 0.0 <= confidence_threshold <= 1.0:
        raise ValueError("confidence_threshold must be between 0 and 1")
    if not 0.0 < nms_iou_threshold <= 1.0:
        raise ValueError("nms_iou_threshold must be greater than 0 and at most 1")
    if image_size < 32:
        raise ValueError("image_size must be at least 32")

    yaml_path, val_dir, labels_dir, class_names = _dataset_config(dataset_yaml)
    images = sorted(path for path in val_dir.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS)
    if not images:
        raise ValueError("Validation dataset contains no supported image files")

    weights = yolo_adapter._resolve_model(model_path)
    model = yolo_adapter._load_yolo(weights)
    ground_truth: list[dict[str, Any]] = []
    predictions: list[dict[str, Any]] = []
    for image_path in images:
        image_id = str(image_path.relative_to(val_dir)).replace("\\", "/")
        label_path = labels_dir / image_path.relative_to(val_dir).with_suffix(".txt")
        ground_truth.extend(_ground_truth_for_image(image_path, image_id, label_path))

        predict_kwargs: dict[str, Any] = {
            "source": str(image_path),
            "conf": confidence_threshold,
            "iou": nms_iou_threshold,
            "imgsz": image_size,
            "verbose": False,
        }
        if device:
            predict_kwargs["device"] = device
        results = model.predict(**predict_kwargs)
        if not results:
            raise RuntimeError(f"YOLO returned no inference result for {image_path.name}")
        predictions.extend(_predictions_for_image(results[0], image_id))

    metrics = evaluate_detections(
        ground_truth,
        predictions,
        iou_threshold=iou_threshold,
        image_count=len(images),
    )
    for row in metrics["per_class"]:
        row["class_name"] = class_names.get(row["class_id"], str(row["class_id"]))

    output_dir = Path(out_root) / "evaluation" / "detection"
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"detection_evaluation_{uuid.uuid4().hex[:8]}.json"
    result = {
        "status": "success",
        "tool": "DetectionEvaluation",
        "dataset_yaml": str(yaml_path),
        "model_path": weights,
        "class_names": class_names,
        "ground_truth_count": len(ground_truth),
        "prediction_count": len(predictions),
        "parameters": {
            "confidence_threshold": confidence_threshold,
            "iou_threshold": iou_threshold,
            "nms_iou_threshold": nms_iou_threshold,
            "image_size": image_size,
            "device": device,
        },
        **metrics,
    }
    json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    result["json_path"] = str(json_path)
    return result
