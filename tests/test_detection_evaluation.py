import pytest

from server.algos.evaluation.detection_metrics import box_iou, evaluate_detections


def detection(class_id, box, *, image_id="image-1", confidence=0.9):
    return {
        "image_id": image_id,
        "class_id": class_id,
        "box_xyxy": box,
        "confidence": confidence,
    }


def test_box_iou_reports_overlap_and_no_overlap():
    assert box_iou([0, 0, 10, 10], [0, 0, 10, 10]) == 1.0
    assert box_iou([0, 0, 10, 10], [5, 5, 15, 15]) == pytest.approx(25 / 175)
    assert box_iou([0, 0, 10, 10], [11, 11, 20, 20]) == 0.0


def test_detection_evaluation_matches_by_image_class_and_iou_once_only():
    result = evaluate_detections(
        ground_truth=[
            detection(0, [0, 0, 10, 10], image_id="a"),
            detection(1, [20, 20, 30, 30], image_id="a"),
            detection(0, [0, 0, 10, 10], image_id="b"),
        ],
        predictions=[
            detection(0, [0, 0, 10, 10], image_id="a", confidence=0.95),
            detection(0, [0, 0, 10, 10], image_id="a", confidence=0.80),
            detection(0, [20, 20, 30, 30], image_id="a", confidence=0.70),
            detection(0, [20, 20, 30, 30], image_id="b", confidence=0.60),
        ],
        iou_threshold=0.5,
    )

    assert result["image_count"] == 2
    assert result["metrics"] == {
        "tp": 1,
        "fp": 3,
        "fn": 2,
        "detection_rate": pytest.approx(1 / 3),
        "false_detection_rate": pytest.approx(3 / 4),
        "precision": pytest.approx(1 / 4),
        "false_positives_per_image": pytest.approx(1.5),
    }
    assert result["per_class"] == [
        {
            "class_id": 0,
            "ground_truth_count": 2,
            "prediction_count": 4,
            "tp": 1,
            "fp": 3,
            "fn": 1,
            "detection_rate": 0.5,
            "false_detection_rate": 0.75,
            "precision": 0.25,
            "false_positives_per_image": 1.5,
        },
        {
            "class_id": 1,
            "ground_truth_count": 1,
            "prediction_count": 0,
            "tp": 0,
            "fp": 0,
            "fn": 1,
            "detection_rate": 0.0,
            "false_detection_rate": 0.0,
            "precision": 0.0,
            "false_positives_per_image": 0.0,
        },
    ]


def test_detection_evaluation_keeps_images_separate_and_handles_empty_results():
    result = evaluate_detections(
        ground_truth=[detection(0, [0, 0, 10, 10], image_id="a")],
        predictions=[detection(0, [0, 0, 10, 10], image_id="b")],
    )
    assert result["metrics"]["tp"] == 0
    assert result["metrics"]["fp"] == 1
    assert result["metrics"]["fn"] == 1

    empty = evaluate_detections([], [], image_count=3)
    assert empty["image_count"] == 3
    assert empty["metrics"] == {
        "tp": 0,
        "fp": 0,
        "fn": 0,
        "detection_rate": 0.0,
        "false_detection_rate": 0.0,
        "precision": 0.0,
        "false_positives_per_image": 0.0,
    }


@pytest.mark.parametrize(
    ("ground_truth", "predictions", "kwargs", "message"),
    [
        ([detection(0, [0, 0, 10, 10])], [], {"iou_threshold": 0}, "iou_threshold"),
        ([detection(0, [0, 10, 10, 0])], [], {}, "x2 > x1"),
        ([detection(-1, [0, 0, 10, 10])], [], {}, "non-negative integer"),
        ([], [detection(0, [0, 0, 10, 10], confidence=1.2)], {}, "between 0 and 1"),
        ([detection(0, [0, 0, 10, 10], image_id="a")], [], {"image_count": 0}, "cannot be lower"),
    ],
)
def test_detection_evaluation_rejects_invalid_input(ground_truth, predictions, kwargs, message):
    with pytest.raises(ValueError, match=message):
        evaluate_detections(ground_truth, predictions, **kwargs)
