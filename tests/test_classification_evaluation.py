import pytest

from server.algos.evaluation.classification_metrics import evaluate_classification


def test_binary_evaluation_returns_confusion_metrics_and_perfect_roc():
    result = evaluate_classification(
        [0, 1, 1, 0],
        [0, 1, 0, 0],
        y_scores=[0.05, 0.95, 0.40, 0.20],
        class_names=["negative", "positive"],
    )

    assert result["confusion_matrix"] == [[2, 0], [1, 1]]
    assert result["normalized_confusion_matrix"] == [[1.0, 0.0], [0.5, 0.5]]
    assert result["metrics"]["accuracy"] == pytest.approx(0.75)
    assert result["metrics"]["per_class"][1] == {
        "class_id": 1,
        "class_name": "positive",
        "tp": 1,
        "fp": 0,
        "fn": 1,
        "tn": 2,
        "precision": 1.0,
        "recall": 0.5,
        "f1_score": pytest.approx(2 / 3),
        "support": 2,
    }
    assert result["roc_curves"][0]["class_name"] == "positive"
    assert result["roc_curves"][0]["auc"] == pytest.approx(1.0)
    assert result["macro_auc"] == pytest.approx(1.0)


def test_multiclass_evaluation_creates_one_vs_rest_roc_for_each_class():
    result = evaluate_classification(
        [0, 1, 2, 1, 0, 2],
        [0, 2, 2, 1, 0, 1],
        y_scores=[
            [0.95, 0.03, 0.02],
            [0.20, 0.35, 0.45],
            [0.05, 0.10, 0.85],
            [0.10, 0.80, 0.10],
            [0.85, 0.10, 0.05],
            [0.20, 0.50, 0.30],
        ],
        class_names=["circle", "square", "triangle"],
    )

    assert result["confusion_matrix"] == [[2, 0, 0], [0, 1, 1], [0, 1, 1]]
    assert len(result["roc_curves"]) == 3
    assert [curve["class_name"] for curve in result["roc_curves"]] == [
        "circle", "square", "triangle"
    ]
    assert all(0.0 <= curve["auc"] <= 1.0 for curve in result["roc_curves"])


@pytest.mark.parametrize(
    ("y_true", "y_pred", "message"),
    [
        ([0], [0], "At least two classes"),
        ([0, 1], [0], "same number of items"),
        ([0, 1], [0, 2], "outside the supplied class_names"),
        ([0, -1], [0, 1], "non-negative integer"),
    ],
)
def test_evaluation_rejects_invalid_labels(y_true, y_pred, message):
    kwargs = {"class_names": ["zero", "one"]} if message == "outside the supplied class_names" else {}
    with pytest.raises(ValueError, match=message):
        evaluate_classification(y_true, y_pred, **kwargs)


def test_evaluation_rejects_bad_score_shapes_and_single_class_roc():
    with pytest.raises(ValueError, match="same number of items"):
        evaluate_classification([0, 1], [0, 1], y_scores=[0.9])

    with pytest.raises(ValueError, match="contain 3 class scores"):
        evaluate_classification(
            [0, 1, 2],
            [0, 1, 2],
            y_scores=[[0.9, 0.1], [0.1, 0.8], [0.1, 0.1]],
            class_names=["zero", "one", "two"],
        )

    with pytest.raises(ValueError, match="ROC requires"):
        evaluate_classification([1, 1], [1, 1], y_scores=[0.7, 0.9], class_names=["zero", "one"])


def test_evaluation_can_return_confusion_metrics_without_roc_scores():
    result = evaluate_classification([0, 1, 0, 1], [0, 0, 0, 1])

    assert result["metrics"]["accuracy"] == pytest.approx(0.75)
    assert "roc_curves" not in result
