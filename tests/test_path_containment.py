"""Client file references stay inside OUT, and the public session secret only runs locally.

A path outside OUT used to be accepted as is, so the Dataset Builder could copy any
server file (such as .env) under /static, where anyone can download it.
"""
from base64 import b64encode
import json
import os
from dataclasses import replace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from server import utils_io
from server.config import DEV_SESSION_SECRET, check_session_secret, settings
from server.database import Base, get_db
from server.main import app
from server.models import User
from server.processing import require_file


@pytest.fixture
def out_dir(tmp_path, monkeypatch):
    out = tmp_path / "outputs"
    (out / "uploads").mkdir(parents=True)
    (out / "samples").mkdir()
    (out / "samples" / "a.png").write_bytes(b"x")
    (tmp_path / "secret.env").write_text("SESSION_SECRET=x")
    monkeypatch.setattr(utils_io, "OUT", str(out))
    monkeypatch.setattr(utils_io, "UPLOAD_DIR", str(out / "uploads"))
    return out


def test_static_and_absolute_paths_inside_out_resolve(out_dir):
    real = os.path.realpath(out_dir / "samples" / "a.png")
    assert utils_io.resolve_image_path("/static/samples/a.png") == real
    assert utils_io.resolve_image_path("http://localhost:8000/static/samples/a.png") == real
    assert utils_io.resolve_image_path(str(out_dir / "samples" / "a.png")) == real


@pytest.mark.parametrize("reference", [
    "/etc/hosts",
    "/static/../secret.env",
    "/static/samples/../../secret.env",
    "http://localhost:8000/static/../secret.env",
    "relative/file.png",
])
def test_paths_outside_out_are_rejected(out_dir, reference):
    with pytest.raises(ValueError):
        utils_io.resolve_image_path(reference)


def test_a_link_inside_out_that_points_outside_is_rejected(out_dir, tmp_path):
    os.symlink(tmp_path / "secret.env", out_dir / "samples" / "link.png")
    with pytest.raises(ValueError):
        utils_io.resolve_image_path("/static/samples/link.png")


def test_require_file_answers_404_for_a_path_outside_out_even_when_it_exists(out_dir):
    with pytest.raises(HTTPException) as caught:
        require_file("/etc/hosts", "Image not found")
    assert caught.value.status_code == 404


def test_locate_file_still_finds_a_recorded_path_by_name(out_dir):
    # Bundled result JSONs record absolute paths from another machine.
    found = utils_io.locate_file("/home/someone/elsewhere/a.png")
    assert found == str(out_dir / "samples" / "a.png")


@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(provider_subject="paths", email="paths@example.com", display_name="paths")
        db.add(user)
        db.commit()
        user_id = user.id

    def override_get_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    payload = b64encode(json.dumps({"user_id": user_id}).encode("utf-8"))
    cookie = TimestampSigner(settings.session_secret).sign(payload).decode("utf-8")
    with TestClient(app) as test_client:
        test_client.cookies.set("viper_session", cookie, domain="testserver.local", path="/")
        yield test_client
    app.dependency_overrides.clear()


def _dataset_request(image_path: str, **extra) -> dict:
    box = {"class_id": 0, "x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2}
    return {
        "images": [
            {"image_path": image_path, "annotations": [box]},
            {"image_path": image_path, "annotations": [box]},
        ],
        "class_names": ["thing"],
        **extra,
    }


def test_dataset_builder_refuses_a_server_file_outside_out(client, out_dir, tmp_path):
    response = client.post("/api/detection/dataset", json=_dataset_request(str(tmp_path / "secret.env")))
    assert response.status_code == 400
    assert not (out_dir / "detection").exists()


@pytest.mark.parametrize("name", ["../escape", "a/b", ".hidden", ""])
def test_dataset_and_run_names_cannot_leave_their_folder(client, out_dir, name):
    response = client.post(
        "/api/detection/dataset",
        json=_dataset_request("/static/samples/a.png", name=name),
    )
    assert response.status_code == 422
    response = client.post("/api/detection/train/start", json={"dataset_yaml": "x.yaml", "run_name": name})
    assert response.status_code == 422


def test_public_session_secret_is_refused_off_localhost():
    deployed = replace(settings, session_secret=DEV_SESSION_SECRET, backend_url="https://viper.example.org")
    with pytest.raises(RuntimeError):
        check_session_secret(deployed)


@pytest.mark.parametrize("backend_url", ["http://localhost:8000", "http://127.0.0.1:8000"])
def test_public_session_secret_is_allowed_on_this_machine(backend_url):
    check_session_secret(replace(settings, session_secret=DEV_SESSION_SECRET, backend_url=backend_url))


def test_a_set_session_secret_is_allowed_anywhere():
    check_session_secret(replace(settings, session_secret="real-secret", backend_url="https://viper.example.org"))


@pytest.mark.parametrize("field, value", [("epochs", 301), ("batch", 129), ("image_size", 1281)])
def test_training_settings_have_upper_limits(client, field, value):
    # One shared worker trains for everyone; an oversized job would block the class.
    response = client.post("/api/detection/train/start", json={"dataset_yaml": "x.yaml", field: value})
    assert response.status_code == 422
