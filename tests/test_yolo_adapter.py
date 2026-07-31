from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest

from server.algos.detection import yolo_adapter


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
    xyxy = FakeTensor([[5, 6, 30, 35]])
    conf = FakeTensor([0.91])
    cls = FakeTensor([0])


class FakeResult:
    boxes = FakeBoxes()
    names = {0: "shape"}

    @staticmethod
    def plot():
        return np.zeros((40, 50, 3), dtype=np.uint8)


class FakeModel:
    names = {0: "shape"}

    def predict(self, **kwargs):
        self.predict_kwargs = kwargs
        return [FakeResult()]


class FakeTrainResult:
    def __init__(self, save_dir: Path):
        self.save_dir = save_dir


class FakeTrainModel:
    def __init__(self, save_dir: Path):
        self.save_dir = save_dir

    def train(self, **kwargs):
        self.train_kwargs = kwargs
        weights = self.save_dir / "weights"
        weights.mkdir(parents=True)
        (weights / "best.pt").write_bytes(b"best")
        (weights / "last.pt").write_bytes(b"last")
        return FakeTrainResult(self.save_dir)


def test_heatmap_metrics_reward_compact_activation_inside_box():
    heatmap = np.zeros((100, 100), dtype=np.float32)
    heatmap[30:50, 30:50] = 1.0

    metrics = yolo_adapter.heatmap_metrics(heatmap, [[25, 25, 55, 55]])

    assert metrics["largest_component_ratio"] == pytest.approx(1.0)
    assert metrics["energy_in_boxes"] == pytest.approx(1.0)
    assert metrics["heatmap_compactness"] == pytest.approx((1.0 + 1.0 + 0.96) / 3)
    assert metrics["active_area_ratio"] == pytest.approx(0.04)


def test_heatmap_metrics_reports_zero_for_empty_cam():
    metrics = yolo_adapter.heatmap_metrics(np.zeros((8, 8), dtype=np.float32))
    assert metrics["heatmap_compactness"] == 0.0
    assert metrics["energy_in_boxes"] == 0.0


def test_detect_writes_viper_image_and_json(tmp_path: Path, monkeypatch):
    image = tmp_path / "input.jpg"
    model = tmp_path / "best.pt"
    cv2.imwrite(str(image), np.zeros((40, 50, 3), dtype=np.uint8))
    model.write_bytes(b"fake")
    fake_model = FakeModel()
    monkeypatch.setattr(yolo_adapter, "_load_yolo", lambda _: fake_model)

    result = yolo_adapter.detect(
        str(image), str(tmp_path / "outputs"), str(model), confidence=0.4, iou=0.6
    )

    assert result["status"] == "success"
    assert result["detection_count"] == 1
    assert result["detections"][0]["class_name"] == "shape"
    assert result["detections"][0]["confidence"] == pytest.approx(0.91)
    assert Path(result["output_image_path"]).is_file()
    assert Path(result["json_path"]).is_file()
    assert fake_model.predict_kwargs["conf"] == 0.4
    assert fake_model.predict_kwargs["iou"] == 0.6


def test_detect_rejects_missing_model(tmp_path: Path):
    image = tmp_path / "input.jpg"
    cv2.imwrite(str(image), np.zeros((10, 10, 3), dtype=np.uint8))

    with pytest.raises(FileNotFoundError, match="YOLO model not found"):
        yolo_adapter.detect(str(image), str(tmp_path), str(tmp_path / "missing.pt"))


def test_model_alias_does_not_require_an_experiment_directory():
    assert yolo_adapter.DEFAULT_MODEL == "yolo11n.pt"
    assert yolo_adapter._resolve_model("yolo11n.pt") == "yolo11n.pt"


def test_viper_runtime_has_no_sida_dependency():
    project_root = Path(__file__).resolve().parents[1]
    runtime_paths = [
        project_root / "server" / "algos" / "detection",
        project_root / "server" / "routers" / "detection.py",
        project_root / "my-react-flow-app" / "src" / "components" / "nodes" / "YoloNodes.tsx",
        project_root / "my-react-flow-app" / "src" / "lib" / "runners" / "detection.tsx",
    ]
    offenders = []
    for runtime_path in runtime_paths:
        files = runtime_path.rglob("*") if runtime_path.is_dir() else [runtime_path]
        for file_path in files:
            if file_path.is_file() and file_path.suffix in {".py", ".ts", ".tsx"}:
                if "SIDA" in file_path.read_text(encoding="utf-8"):
                    offenders.append(str(file_path.relative_to(project_root)))
    assert offenders == []


def test_train_returns_best_model_for_downstream_nodes(tmp_path: Path, monkeypatch):
    dataset = tmp_path / "data.yaml"
    dataset.write_text("path: .\ntrain: images\nval: images\nnames: [shape]\n")
    save_dir = tmp_path / "runs" / "unit"
    fake_model = FakeTrainModel(save_dir)
    loaded_models = []
    monkeypatch.setattr(yolo_adapter, "_load_yolo", lambda model: loaded_models.append(model) or fake_model)

    result = yolo_adapter.train(
        str(dataset), str(tmp_path / "outputs"), epochs=2, batch=1
    )

    assert result["best_model_path"] == str(save_dir / "weights" / "best.pt")
    assert Path(result["json_path"]).is_file()
    assert fake_model.train_kwargs["epochs"] == 2
    assert fake_model.train_kwargs["batch"] == 1
    assert loaded_models == [yolo_adapter.DEFAULT_MODEL]
