"""F1 (final checkpoint): an uploaded .pt must never run code on the server.

Two guards are checked here:
- loaders refuse pickled code: Ultralytics runs in safe mode (ULTRALYTICS_SAFE_LOAD, set in
  server/__init__.py) and U-Net loads its state_dict with torch.load(weights_only=True);
- every route that takes model_path accepts only weights under models/ or the app's own
  training runs in outputs/detection/train, so an uploaded file cannot be named at all (4xx).
"""
from base64 import b64encode
import io
import json
import os
import pickle

os.environ["AUTO_CREATE_TABLES"] = "false"

import pytest
import torch
from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from server.algos.detection import yolo_adapter
from server.config import settings
from server.database import Base, get_db
from server.main import app
from server.models import User


class RunsCode:
    """Unpickling this object calls open(marker, "w"): a stand-in for any code an attacker wants run."""

    def __init__(self, marker: str):
        self.marker = marker

    def __reduce__(self):
        return (open, (self.marker, "w"))


def malicious_weights(tmp_path, fmt: str):
    marker = tmp_path / f"pwned-{fmt}"
    weights = tmp_path / f"evil-{fmt}.pt"
    if fmt == "zip":
        torch.save(RunsCode(str(marker)), weights)  # current torch format: zip archive with data.pkl
    else:
        weights.write_bytes(pickle.dumps(RunsCode(str(marker)), protocol=2))  # legacy pickle stream
    return weights, marker


def test_ultralytics_safe_load_is_on_for_the_server():
    from ultralytics.utils import SAFE_LOAD

    assert os.environ.get("ULTRALYTICS_SAFE_LOAD") == "1"
    assert SAFE_LOAD is True


@pytest.mark.parametrize("fmt", ["zip", "legacy"])
def test_yolo_refuses_a_pt_with_pickled_code(tmp_path, monkeypatch, fmt):
    weights, marker = malicious_weights(tmp_path, fmt)
    # Even if such a file were inside an allowed folder, loading it must not run its code.
    monkeypatch.setattr(yolo_adapter, "allowed_model_roots", lambda: (tmp_path.resolve(),))

    with pytest.raises(Exception):
        yolo_adapter._load_yolo(yolo_adapter._resolve_model(str(weights)))
    assert not marker.exists()


@pytest.mark.parametrize("fmt", ["zip", "legacy"])
def test_unet_refuses_a_pt_with_pickled_code(tmp_path, fmt):
    from server.algos.segmentation import UNET

    weights, marker = malicious_weights(tmp_path, fmt)
    image = tmp_path / "input.png"
    Image.new("RGB", (16, 16)).save(image)

    with pytest.raises(Exception):
        UNET.run(str(image), str(tmp_path / "out"), model_path=str(weights))
    assert not marker.exists()


# ---------------------------------------------------------------- model_path outside the allowed folders


@pytest.fixture
def client(monkeypatch, tmp_path):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(provider_subject="f1", email="f1@example.com", display_name="f1")
        db.add(user)
        db.commit()
        user_id = user.id

    def override_get_db():
        with Session(engine) as db:
            yield db

    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    monkeypatch.setattr("server.main.UPLOAD_DIR", str(upload_dir))

    def must_not_load(path):
        raise AssertionError(f"a model outside the allowed folders was loaded: {path}")

    monkeypatch.setattr(yolo_adapter, "_load_yolo", must_not_load)
    app.dependency_overrides[get_db] = override_get_db
    cookie = TimestampSigner(settings.session_secret).sign(b64encode(json.dumps({"user_id": user_id}).encode())).decode()
    with TestClient(app) as test_client:
        test_client.cookies.set("viper_session", cookie, domain="testserver.local", path="/")
        test_client.upload_dir = upload_dir
        yield test_client
    app.dependency_overrides.clear()


def uploaded_model_paths(client, tmp_path):
    """Upload a .pt the way an attacker would and return every way it could be named."""
    weights, _ = malicious_weights(tmp_path, "zip")
    response = client.post("/api/upload", files={"files": ("x.pt", weights.read_bytes(), "application/octet-stream")})
    assert response.status_code == 200
    saved = response.json()["files"][0]
    on_disk = str(client.upload_dir / os.path.basename(saved["url"]))
    assert os.path.isfile(on_disk)
    return [on_disk, saved["path"], "models/../server/__init__.py", str(weights)]


def detection_requests(image: str, dataset: str, model_path: str):
    return [
        ("/api/detection/detect", {"image_path": image, "model_path": model_path}),
        ("/api/detection/gradcam", {"image_path": image, "model_path": model_path}),
        ("/api/detection/train", {"dataset_yaml": dataset, "model_path": model_path, "epochs": 1}),
        ("/api/detection/train/start", {"dataset_yaml": dataset, "model_path": model_path, "epochs": 1}),
        ("/api/evaluation/detection", {"dataset_yaml": dataset, "model_path": model_path}),
    ]


def test_model_path_outside_allowed_folders_is_rejected_with_4xx(client, tmp_path, monkeypatch):
    # Input images must sit inside OUT, so the routes get past the image check to the model check.
    monkeypatch.setattr("server.utils_io.OUT", str(tmp_path))
    image = tmp_path / "input.png"
    Image.new("RGB", (32, 32)).save(image)
    # A minimal YOLO dataset, so routes that read the dataset first still reach the model check.
    (tmp_path / "images").mkdir()
    (tmp_path / "labels").mkdir()
    Image.new("RGB", (32, 32)).save(tmp_path / "images" / "a.png")
    (tmp_path / "labels" / "a.txt").write_text("0 0.5 0.5 0.2 0.2\n", encoding="utf-8")
    dataset = tmp_path / "data.yaml"
    dataset.write_text(f"path: {tmp_path}\ntrain: images\nval: images\nnames: ['shape']\n", encoding="utf-8")

    for model_path in uploaded_model_paths(client, tmp_path):
        for route, body in detection_requests(str(image), str(dataset), model_path):
            response = client.post(route, json=body)
            assert 400 <= response.status_code < 500, (route, model_path, response.status_code, response.text)
            assert "models/" in response.json()["detail"], (route, model_path, response.text)


def test_bundled_and_trained_models_are_still_allowed(tmp_path, monkeypatch):
    out = tmp_path / "outputs"
    run = out / "detection" / "train" / "train_abc" / "weights"
    run.mkdir(parents=True)
    (run / "best.pt").write_bytes(b"weights")
    monkeypatch.setattr(yolo_adapter.utils_io, "OUT", str(out))

    assert yolo_adapter._resolve_model(yolo_adapter.DEFAULT_MODEL).endswith(os.path.join("models", "yolo11n.pt"))
    assert yolo_adapter._resolve_model(str(run / "best.pt")) == str((run / "best.pt").resolve())
