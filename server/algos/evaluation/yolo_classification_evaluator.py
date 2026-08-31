"""Turn one labelled YOLO test image into classification-style metrics."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Mapping, Sequence

from server.algos.detection import yolo_adapter
from server.algos.evaluation.classification_metrics import evaluate_classification
from server.algos.evaluation.detection_metrics import box_iou


def _ground_truth_boxes(image_path: str, annotations: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    import cv2

    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Could not read test image: {image_path}")
    height, width = image.shape[:2]
    boxes: list[dict[str, Any]] = []
    for index, annotation in enumerate(annotations):
        try:
            class_id = int(annotation["class_id"])
            x = float(annotation["x"])
            y = float(annotation["y"])
            box_width = float(annotation["width"])
            box_height = float(annotation["height"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Invalid annotation at index {index}") from exc
        if class_id < 0 or box_width <= 0 or box_height <= 0:
            raise ValueError(f"Invalid annotation at index {index}")
        boxes.append({
            "class_id": class_id,
            "box_xyxy": [x * width, y * height, (x + box_width) * width, (y + box_height) * height],
        })
    if not boxes:
        raise ValueError("The selected Test Image has no labels in the connected YOLO Dataset Builder")
    return boxes


def _classification_pairs(
    ground_truth: Sequence[Mapping[str, Any]],
    predictions: Sequence[Mapping[str, Any]],
    *,
    background_class_id: int,
    iou_threshold: float,
) -> tuple[list[int], list[int]]:
    """Class-agnostic box matching keeps a wrong class visible in the matrix."""
    unmatched = set(range(len(ground_truth)))
    y_true: list[int] = []
    y_pred: list[int] = []
    for prediction in sorted(predictions, key=lambda item: float(item.get("confidence", 0)), reverse=True):
        best_index = None
        best_iou = 0.0
        for index in unmatched:
            overlap = box_iou(prediction["box_xyxy"], ground_truth[index]["box_xyxy"])
            if overlap > best_iou:
                best_index, best_iou = index, overlap
        predicted_class = int(prediction["class_id"])
        if best_index is not None and best_iou >= iou_threshold:
            unmatched.remove(best_index)
            y_true.append(int(ground_truth[best_index]["class_id"]))
            y_pred.append(predicted_class)
        else:
            y_true.append(background_class_id)
            y_pred.append(predicted_class)
    for index in sorted(unmatched):
        y_true.append(int(ground_truth[index]["class_id"]))
        y_pred.append(background_class_id)
    return y_true, y_pred


def evaluate_yolo_test_image(
    *,
    image_path: str,
    model_path: str,
    class_names: Sequence[str],
    annotations: Sequence[Mapping[str, Any]],
    out_root: str | Path,
    confidence_threshold: float = 0.25,
    iou_threshold: float = 0.5,
    nms_iou_threshold: float = 0.7,
    image_size: int = 640,
    device: str | None = None,
) -> dict[str, Any]:
    if not class_names or any(not str(name).strip() for name in class_names):
        raise ValueError("Dataset Builder must provide at least one class name")
    if not 0.0 <= confidence_threshold <= 1.0 or not 0.0 < iou_threshold <= 1.0 or not 0.0 < nms_iou_threshold <= 1.0:
        raise ValueError("Confidence and IoU values must be between 0 and 1")
    if image_size < 32:
        raise ValueError("Image size must be at least 32")

    image = yolo_adapter._require_file(image_path, "Test image")
    labels = _ground_truth_boxes(str(image), annotations)
    detection = yolo_adapter.detect(
        image_path=str(image),
        out_root=str(out_root),
        model_path=model_path,
        confidence=confidence_threshold,
        iou=nms_iou_threshold,
        image_size=image_size,
        device=device,
    )
    background_id = len(class_names)
    y_true, y_pred = _classification_pairs(
        labels,
        detection.get("detections", []),
        background_class_id=background_id,
        iou_threshold=iou_threshold,
    )
    result = evaluate_classification(y_true, y_pred, class_names=[*map(str, class_names), "background"])
    output_dir = Path(out_root) / "evaluation" / "classification"
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"yolo_classification_evaluation_{uuid.uuid4().hex[:8]}.json"
    payload = {
        "status": "success",
        "tool": "YOLOClassificationEvaluation",
        "image_path": str(image),
        "model_path": detection["model_path"],
        "ground_truth_count": len(labels),
        "prediction_count": len(detection.get("detections", [])),
        "matching_iou_threshold": iou_threshold,
        "parameters": {
            "confidence_threshold": confidence_threshold,
            "nms_iou_threshold": nms_iou_threshold,
            "image_size": image_size,
            "device": device,
        },
        "note": "background records unmatched labels and detections; ROC requires full per-class probability scores and is not available from this detector output.",
        **result,
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    payload["json_path"] = str(json_path)
    return payload
