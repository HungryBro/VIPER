from pathlib import Path

import cv2
import numpy as np
import pytest
import yaml

from server.algos.detection import yolo_adapter
from server.algos.evaluation.detection_evaluator import evaluate_yolo_dataset


class FakeTensor:
    def __init__(self, values):
        self.values = np.asarray(values)

    def detach(self):
        return self

    def cpu(self):
        return self

    def numpy(self):
        return self.values


class FakeBoxes:
    def __init__(self, box, confidence, class_id):
        self.xyxy = FakeTensor([box])
        self.conf = FakeTensor([confidence])
        self.cls = FakeTensor([class_id])


class FakeResult:
    def __init__(self, box, confidence, class_id):
        self.boxes = FakeBoxes(box, confidence, class_id)


class FakeModel:
    def __init__(self):
        self.calls = []

    def predict(self, **kwargs):
        self.calls.append(kwargs)
        source = Path(kwargs["source"]).name
        if source == "shape.jpg":
            return [FakeResult([10, 10, 50, 50], 0.95, 0)]
        return [FakeResult([20, 20, 40, 40], 0.75, 1)]


def make_validation_dataset(tmp_path: Path) -> Path:
    root = tmp_path / "dataset"
    image_dir = root / "images" / "val"
    label_dir = root / "labels" / "val"
    image_dir.mkdir(parents=True)
    label_dir.mkdir(parents=True)
    assert cv2.imwrite(str(image_dir / "shape.jpg"), np.zeros((100, 100, 3), dtype=np.uint8))
    assert cv2.imwrite(str(image_dir / "empty.jpg"), np.zeros((100, 100, 3), dtype=np.uint8))
    (label_dir / "shape.txt").write_text("0 0.3 0.3 0.4 0.4\n", encoding="utf-8")
    (label_dir / "empty.txt").write_text("", encoding="utf-8")
    yaml_path = root / "data.yaml"
    yaml_path.write_text(
        yaml.safe_dump({"path": str(root), "val": "images/val", "names": {0: "shape", 1: "other"}}),
        encoding="utf-8",
    )
    return yaml_path


def test_evaluator_reads_yolo_labels_runs_model_and_writes_result(tmp_path: Path, monkeypatch):
    dataset_yaml = make_validation_dataset(tmp_path)
    model_path = tmp_path / "best.pt"
    model_path.write_bytes(b"model")
    model = FakeModel()
    monkeypatch.setattr(yolo_adapter, "_load_yolo", lambda _: model)

    result = evaluate_yolo_dataset(
        str(dataset_yaml),
        str(model_path),
        tmp_path / "outputs",
        confidence_threshold=0.4,
        iou_threshold=0.5,
        nms_iou_threshold=0.6,
        image_size=320,
    )

    assert result["tool"] == "DetectionEvaluation"
    assert result["image_count"] == 2
    assert result["ground_truth_count"] == 1
    assert result["prediction_count"] == 2
    assert result["metrics"]["tp"] == 1
    assert result["metrics"]["fp"] == 1
    assert result["metrics"]["fn"] == 0
    assert result["metrics"]["detection_rate"] == 1.0
    assert result["metrics"]["false_detection_rate"] == 0.5
    assert result["per_class"][0]["class_name"] == "shape"
    assert Path(result["json_path"]).is_file()
    assert len(model.calls) == 2
    assert all(call["conf"] == 0.4 and call["iou"] == 0.6 and call["imgsz"] == 320 for call in model.calls)


def test_evaluator_rejects_missing_validation_images(tmp_path: Path):
    root = tmp_path / "dataset"
    (root / "images" / "val").mkdir(parents=True)
    yaml_path = root / "data.yaml"
    yaml_path.write_text(yaml.safe_dump({"path": str(root), "val": "images/val", "names": {0: "shape"}}), encoding="utf-8")
    model_path = tmp_path / "best.pt"
    model_path.write_bytes(b"model")

    with pytest.raises(ValueError, match="contains no supported image"):
        evaluate_yolo_dataset(str(yaml_path), str(model_path), tmp_path / "outputs")
