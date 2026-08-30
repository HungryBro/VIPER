"""HTTP endpoints for the Evaluation nodes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from server.algos.evaluation import evaluate_classification


router = APIRouter()


class ClassificationEvaluationReq(BaseModel):
    """Predictions and labels supplied by a Classification Evaluation node."""

    y_true: list[Any] = Field(min_length=1)
    y_pred: list[Any] = Field(min_length=1)
    y_scores: list[Any] | None = None
    class_names: list[str] | None = None


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
