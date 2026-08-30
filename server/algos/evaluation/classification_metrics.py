"""Classification evaluation metrics used by the Evaluation nodes.

This module deliberately has no FastAPI or database dependency.  Keeping the
calculation here makes the formulas easy to test and lets a future API or node
reuse exactly the same result structure.
"""

from __future__ import annotations

from math import isfinite
from numbers import Integral, Real
from typing import Any, Sequence


def _as_label_list(values: Sequence[Any], field_name: str) -> list[int]:
    if not isinstance(values, Sequence) or isinstance(values, (str, bytes)):
        raise ValueError(f"{field_name} must be a list of non-negative integer class IDs")

    labels: list[int] = []
    for index, value in enumerate(values):
        if isinstance(value, bool) or not isinstance(value, Integral) or value < 0:
            raise ValueError(
                f"{field_name}[{index}] must be a non-negative integer class ID"
            )
        labels.append(int(value))
    return labels


def _class_count(
    y_true: list[int], y_pred: list[int], class_names: Sequence[str] | None
) -> tuple[int, list[str]]:
    largest_label = max((*y_true, *y_pred), default=-1)

    if class_names is not None:
        if isinstance(class_names, (str, bytes)) or not isinstance(class_names, Sequence):
            raise ValueError("class_names must be a list of non-empty class names")
        names = [str(name).strip() for name in class_names]
        if not names or any(not name for name in names):
            raise ValueError("class_names must contain at least one non-empty class name")
        if len(set(names)) != len(names):
            raise ValueError("class_names must be unique")
        if largest_label >= len(names):
            raise ValueError("A class ID is outside the supplied class_names list")
        return len(names), names

    count = largest_label + 1
    if count < 2:
        raise ValueError("At least two classes are required for classification evaluation")
    return count, [str(index) for index in range(count)]


def _validate_scores(
    y_scores: Sequence[Any] | None,
    sample_count: int,
    class_count: int,
) -> list[float] | list[list[float]] | None:
    if y_scores is None:
        return None
    if isinstance(y_scores, (str, bytes)) or not isinstance(y_scores, Sequence):
        raise ValueError("y_scores must be a list")
    if len(y_scores) != sample_count:
        raise ValueError("y_scores must have the same number of items as y_true")

    if class_count == 2 and all(isinstance(value, Real) and not isinstance(value, bool) for value in y_scores):
        scores = [float(value) for value in y_scores]
        if not all(isfinite(value) for value in scores):
            raise ValueError("y_scores must contain only finite numbers")
        return scores

    rows: list[list[float]] = []
    for sample_index, row in enumerate(y_scores):
        if isinstance(row, (str, bytes)) or not isinstance(row, Sequence):
            raise ValueError(
                "Multiclass y_scores must contain one score list per sample"
            )
        if len(row) != class_count:
            raise ValueError(
                f"y_scores[{sample_index}] must contain {class_count} class scores"
            )
        if any(not isinstance(value, Real) or isinstance(value, bool) for value in row):
            raise ValueError("y_scores must contain only finite numbers")
        numeric_row = [float(value) for value in row]
        if not all(isfinite(value) for value in numeric_row):
            raise ValueError("y_scores must contain only finite numbers")
        rows.append(numeric_row)
    return rows


def _confusion_matrix(y_true: list[int], y_pred: list[int], class_count: int) -> list[list[int]]:
    matrix = [[0 for _ in range(class_count)] for _ in range(class_count)]
    for actual, predicted in zip(y_true, y_pred):
        matrix[actual][predicted] += 1
    return matrix


def _per_class_metrics(matrix: list[list[int]], class_names: list[str]) -> list[dict[str, Any]]:
    per_class: list[dict[str, Any]] = []
    total = sum(sum(row) for row in matrix)
    for class_id, row in enumerate(matrix):
        true_positive = row[class_id]
        false_negative = sum(row) - true_positive
        false_positive = sum(matrix[other][class_id] for other in range(len(matrix))) - true_positive
        true_negative = total - true_positive - false_negative - false_positive
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        f1_score = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class.append(
            {
                "class_id": class_id,
                "class_name": class_names[class_id],
                "tp": true_positive,
                "fp": false_positive,
                "fn": false_negative,
                "tn": true_negative,
                "precision": precision,
                "recall": recall,
                "f1_score": f1_score,
                "support": sum(row),
            }
        )
    return per_class


def _roc_curve(y_binary: list[int], scores: list[float]) -> dict[str, Any]:
    positives = sum(y_binary)
    negatives = len(y_binary) - positives
    if positives == 0 or negatives == 0:
        raise ValueError("ROC requires at least one positive and one negative sample per class")

    ranked = sorted(zip(scores, y_binary), key=lambda item: item[0], reverse=True)
    points: list[dict[str, float | None]] = [
        {"threshold": None, "false_positive_rate": 0.0, "true_positive_rate": 0.0}
    ]
    true_positive = 0
    false_positive = 0
    cursor = 0
    while cursor < len(ranked):
        threshold = ranked[cursor][0]
        while cursor < len(ranked) and ranked[cursor][0] == threshold:
            if ranked[cursor][1]:
                true_positive += 1
            else:
                false_positive += 1
            cursor += 1
        points.append(
            {
                "threshold": threshold,
                "false_positive_rate": false_positive / negatives,
                "true_positive_rate": true_positive / positives,
            }
        )

    auc = 0.0
    for previous, current in zip(points, points[1:]):
        x1 = float(previous["false_positive_rate"])
        x2 = float(current["false_positive_rate"])
        y1 = float(previous["true_positive_rate"])
        y2 = float(current["true_positive_rate"])
        auc += (x2 - x1) * (y1 + y2) / 2
    return {"points": points, "auc": auc}


def _roc_curves(
    y_true: list[int], scores: list[float] | list[list[float]], class_names: list[str]
) -> list[dict[str, Any]]:
    class_count = len(class_names)
    curves: list[dict[str, Any]] = []

    if class_count == 2 and all(isinstance(value, float) for value in scores):
        curve = _roc_curve([1 if value == 1 else 0 for value in y_true], scores)
        curves.append({"class_id": 1, "class_name": class_names[1], **curve})
        return curves

    score_rows = scores
    for class_id, class_name in enumerate(class_names):
        class_scores = [row[class_id] for row in score_rows]  # type: ignore[index]
        curve = _roc_curve([1 if value == class_id else 0 for value in y_true], class_scores)
        curves.append({"class_id": class_id, "class_name": class_name, **curve})
    return curves


def evaluate_classification(
    y_true: Sequence[Any],
    y_pred: Sequence[Any],
    *,
    y_scores: Sequence[Any] | None = None,
    class_names: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Calculate confusion-matrix metrics and ROC/AUC data.

    ``y_true`` and ``y_pred`` use zero-based class IDs.  For a binary problem,
    ``y_scores`` is one confidence score for the positive class (class ID 1).
    For multiclass problems it must be a score row for every class.
    """

    actual = _as_label_list(y_true, "y_true")
    predicted = _as_label_list(y_pred, "y_pred")
    if not actual:
        raise ValueError("y_true and y_pred must not be empty")
    if len(actual) != len(predicted):
        raise ValueError("y_true and y_pred must have the same number of items")

    count, names = _class_count(actual, predicted, class_names)
    scores = _validate_scores(y_scores, len(actual), count)
    matrix = _confusion_matrix(actual, predicted, count)
    normalized = [
        [value / sum(row) if sum(row) else 0.0 for value in row]
        for row in matrix
    ]
    per_class = _per_class_metrics(matrix, names)
    accuracy = sum(matrix[index][index] for index in range(count)) / len(actual)
    metrics = {
        "accuracy": accuracy,
        "macro_precision": sum(item["precision"] for item in per_class) / count,
        "macro_recall": sum(item["recall"] for item in per_class) / count,
        "macro_f1_score": sum(item["f1_score"] for item in per_class) / count,
        "per_class": per_class,
    }

    result: dict[str, Any] = {
        "sample_count": len(actual),
        "class_names": names,
        "confusion_matrix": matrix,
        "normalized_confusion_matrix": normalized,
        "metrics": metrics,
    }
    if scores is not None:
        curves = _roc_curves(actual, scores, names)
        result["roc_curves"] = curves
        result["macro_auc"] = sum(curve["auc"] for curve in curves) / len(curves)
    return result
