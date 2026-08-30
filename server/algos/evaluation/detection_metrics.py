"""Object-detection evaluation metrics based on class-aware IoU matching."""

from __future__ import annotations

from math import isfinite
from numbers import Integral, Real
from typing import Any, Mapping, Sequence


NormalizedDetection = dict[str, Any]


def _as_image_id(value: Any) -> str:
    """Normalise IDs so predictions can only match labels from the same image."""
    if value is None:
        return "__single_image__"
    if isinstance(value, (str, int, float)) and not isinstance(value, bool):
        return str(value)
    raise ValueError("image_id must be a string or number when supplied")


def _as_box(value: Any, field_name: str) -> tuple[float, float, float, float]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence) or len(value) != 4:
        raise ValueError(f"{field_name} must contain [x1, y1, x2, y2]")
    if any(not isinstance(item, Real) or isinstance(item, bool) for item in value):
        raise ValueError(f"{field_name} must contain only finite numbers")

    x1, y1, x2, y2 = (float(item) for item in value)
    if not all(isfinite(item) for item in (x1, y1, x2, y2)):
        raise ValueError(f"{field_name} must contain only finite numbers")
    if x2 <= x1 or y2 <= y1:
        raise ValueError(f"{field_name} must have x2 > x1 and y2 > y1")
    return x1, y1, x2, y2


def _normalise_detections(
    values: Sequence[Mapping[str, Any]],
    field_name: str,
    *,
    require_confidence: bool,
) -> list[NormalizedDetection]:
    if isinstance(values, (str, bytes)) or not isinstance(values, Sequence):
        raise ValueError(f"{field_name} must be a list of detections")

    items: list[NormalizedDetection] = []
    for index, raw in enumerate(values):
        if not isinstance(raw, Mapping):
            raise ValueError(f"{field_name}[{index}] must be an object")

        class_id = raw.get("class_id")
        if isinstance(class_id, bool) or not isinstance(class_id, Integral) or class_id < 0:
            raise ValueError(f"{field_name}[{index}].class_id must be a non-negative integer")

        confidence = raw.get("confidence", 1.0)
        if require_confidence and (not isinstance(confidence, Real) or isinstance(confidence, bool)):
            raise ValueError(f"{field_name}[{index}].confidence must be a number")
        if not isinstance(confidence, Real) or isinstance(confidence, bool):
            confidence = 1.0
        confidence = float(confidence)
        if not isfinite(confidence) or not 0.0 <= confidence <= 1.0:
            raise ValueError(f"{field_name}[{index}].confidence must be between 0 and 1")

        items.append(
            {
                "image_id": _as_image_id(raw.get("image_id")),
                "class_id": int(class_id),
                "box_xyxy": _as_box(raw.get("box_xyxy"), f"{field_name}[{index}].box_xyxy"),
                "confidence": confidence,
            }
        )
    return items


def box_iou(box_a: Sequence[Any], box_b: Sequence[Any]) -> float:
    """Return intersection-over-union for two ``[x1, y1, x2, y2]`` boxes."""
    ax1, ay1, ax2, ay2 = _as_box(box_a, "box_a")
    bx1, by1, bx2, by2 = _as_box(box_b, "box_b")
    overlap_width = max(0.0, min(ax2, bx2) - max(ax1, bx1))
    overlap_height = max(0.0, min(ay2, by2) - max(ay1, by1))
    intersection = overlap_width * overlap_height
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - intersection
    return intersection / union if union else 0.0


def _summary(true_positive: int, false_positive: int, false_negative: int, image_count: int) -> dict[str, float | int]:
    detection_rate = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
    return {
        "tp": true_positive,
        "fp": false_positive,
        "fn": false_negative,
        "detection_rate": detection_rate,
        # This is false discovery rate. The explicit formula avoids confusing it
        # with the classification FPR, whose true-negative denominator does not
        # have a useful object-detection equivalent.
        "false_detection_rate": false_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0,
        "precision": precision,
        "false_positives_per_image": false_positive / image_count if image_count else 0.0,
    }


def evaluate_detections(
    ground_truth: Sequence[Mapping[str, Any]],
    predictions: Sequence[Mapping[str, Any]],
    *,
    iou_threshold: float = 0.5,
    image_count: int | None = None,
) -> dict[str, Any]:
    """Evaluate predictions with one-to-one class-aware IoU matching.

    A prediction becomes a true positive only when it has the same ``image_id``
    and ``class_id`` as an unmatched ground-truth box and reaches the requested
    IoU threshold. Remaining predictions are false positives; remaining labels
    are false negatives.
    """
    if isinstance(iou_threshold, bool) or not isinstance(iou_threshold, Real) or not 0.0 < iou_threshold <= 1.0:
        raise ValueError("iou_threshold must be greater than 0 and at most 1")
    if image_count is not None and (isinstance(image_count, bool) or not isinstance(image_count, Integral) or image_count < 0):
        raise ValueError("image_count must be a non-negative integer")

    labels = _normalise_detections(ground_truth, "ground_truth", require_confidence=False)
    predicted = _normalise_detections(predictions, "predictions", require_confidence=True)
    observed_images = {item["image_id"] for item in labels + predicted}
    total_images = int(image_count) if image_count is not None else len(observed_images)
    if total_images < len(observed_images):
        raise ValueError("image_count cannot be lower than the number of supplied image IDs")

    all_classes = sorted({item["class_id"] for item in labels + predicted})
    unmatched = set(range(len(labels)))
    totals = {class_id: {"tp": 0, "fp": 0, "fn": 0} for class_id in all_classes}

    # Evaluate high-confidence predictions first, which matches standard
    # detector evaluation and prevents a duplicate low-confidence box from
    # claiming a ground-truth object before the stronger prediction.
    for prediction in sorted(predicted, key=lambda item: item["confidence"], reverse=True):
        candidates = [
            index for index in unmatched
            if labels[index]["image_id"] == prediction["image_id"]
            and labels[index]["class_id"] == prediction["class_id"]
        ]
        best_index = None
        best_iou = 0.0
        for index in candidates:
            overlap = box_iou(prediction["box_xyxy"], labels[index]["box_xyxy"])
            if overlap > best_iou:
                best_index = index
                best_iou = overlap

        class_total = totals[prediction["class_id"]]
        if best_index is not None and best_iou >= float(iou_threshold):
            unmatched.remove(best_index)
            class_total["tp"] += 1
        else:
            class_total["fp"] += 1

    for index in unmatched:
        totals[labels[index]["class_id"]]["fn"] += 1

    per_class = [
        {
            "class_id": class_id,
            "ground_truth_count": totals[class_id]["tp"] + totals[class_id]["fn"],
            "prediction_count": totals[class_id]["tp"] + totals[class_id]["fp"],
            **_summary(
                totals[class_id]["tp"],
                totals[class_id]["fp"],
                totals[class_id]["fn"],
                total_images,
            ),
        }
        for class_id in all_classes
    ]
    total_tp = sum(item["tp"] for item in totals.values())
    total_fp = sum(item["fp"] for item in totals.values())
    total_fn = sum(item["fn"] for item in totals.values())

    return {
        "iou_threshold": float(iou_threshold),
        "image_count": total_images,
        "metrics": _summary(total_tp, total_fp, total_fn, total_images),
        "per_class": per_class,
        "metric_definitions": {
            "detection_rate": "TP / (TP + FN)",
            "false_detection_rate": "FP / (TP + FP)",
            "false_positives_per_image": "FP / image_count",
        },
    }
