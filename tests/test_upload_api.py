"""C2 (หลังจุดตรวจ 2): /api/upload ตรวจชนิดจากเนื้อหาจริงแต่ไม่ re-encode

ทุกชนิดที่ระบบรับอยู่เดิมต้องอัปโหลดได้ (Image Input รับ .jpg .jpeg .png .bmp .webp .tif .tiff
และ node U-Net อัปโหลดไฟล์ weights .pt/.pth ทางนี้) ไบต์ที่บันทึกต้องเท่ากับที่ส่ง
"""
from base64 import b64encode
from io import BytesIO
import json
import os
import pickle
import zipfile

os.environ["AUTO_CREATE_TABLES"] = "false"

import pytest
from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from server.config import settings
from server.database import Base, get_db
from server.main import app
from server.models import User


@pytest.fixture
def client(monkeypatch, tmp_path):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(provider_subject="uploader", email="uploader@example.com", display_name="uploader")
        db.add(user)
        db.commit()
        user_id = user.id

    def override_get_db():
        with Session(engine) as db:
            yield db

    monkeypatch.setattr("server.main.UPLOAD_DIR", str(tmp_path))
    app.dependency_overrides[get_db] = override_get_db
    payload = b64encode(json.dumps({"user_id": user_id}).encode("utf-8"))
    cookie = TimestampSigner(settings.session_secret).sign(payload).decode("utf-8")
    with TestClient(app) as test_client:
        test_client.cookies.set("viper_session", cookie, domain="testserver.local", path="/")
        test_client.upload_dir = tmp_path
        yield test_client
    app.dependency_overrides.clear()


def image_bytes(fmt: str, **options) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (9, 7), (12, 200, 90)).save(buffer, format=fmt, **options)
    return buffer.getvalue()


def zip_weights() -> bytes:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("archive/data.pkl", b"weights")
    return buffer.getvalue()


ACCEPTED = [
    ("photo.jpg", lambda: image_bytes("JPEG"), "image/jpeg", ".jpg"),
    ("photo.jpeg", lambda: image_bytes("JPEG", quality=70), "image/jpeg", ".jpg"),
    ("scan.png", lambda: image_bytes("PNG"), "image/png", ".png"),
    ("scan.bmp", lambda: image_bytes("BMP"), "image/bmp", ".bmp"),
    ("scan.webp", lambda: image_bytes("WEBP"), "image/webp", ".webp"),
    ("scan.tif", lambda: image_bytes("TIFF"), "image/tiff", ".tif"),
    ("scan.tiff", lambda: image_bytes("TIFF", compression="tiff_lzw"), "image/tiff", ".tif"),
    # The browser may send no type or a wrong one; the bytes decide.
    ("IMG_0001", lambda: image_bytes("PNG"), "application/octet-stream", ".png"),
    ("unet.pt", zip_weights, "application/octet-stream", ".pt"),
    ("unet_legacy.pth", lambda: pickle.dumps({"weights": [1, 2, 3]}, protocol=2), "application/octet-stream", ".pth"),
]


@pytest.mark.parametrize("name, make, mime, ext", ACCEPTED, ids=[item[0] for item in ACCEPTED])
def test_every_previously_accepted_type_uploads_with_unchanged_bytes(client, name, make, mime, ext):
    body = make()
    response = client.post("/api/upload", files={"files": (name, body, mime)})

    assert response.status_code == 200
    saved = response.json()["files"][0]
    assert saved["name"] == name
    assert saved["url"].endswith(ext)
    # F13: "path" is the /static URL (the processing routes resolve it), not the path on the server
    assert saved["path"] == saved["url"]
    assert not saved["path"].startswith(str(client.upload_dir))
    with open(os.path.join(client.upload_dir, os.path.basename(saved["url"])), "rb") as handle:
        assert handle.read() == body


REJECTED = [
    ("evil.html", b"<html><script>alert(1)</script></html>", "image/png"),
    ("evil.png", b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "image/png"),
    ("notes.jpg", b"plain text", "image/jpeg"),
    ("model.pt", b"<html>not a model</html>", "application/octet-stream"),
    ("archive.zip", zip_weights(), "application/zip"),
]


@pytest.mark.parametrize("name, body, mime", REJECTED, ids=[item[0] for item in REJECTED])
def test_non_images_are_rejected_and_nothing_is_written(client, name, body, mime):
    response = client.post("/api/upload", files={"files": (name, body, mime)})

    assert response.status_code == 422
    assert os.listdir(client.upload_dir) == []


def test_a_batch_with_one_bad_file_writes_nothing(client):
    response = client.post(
        "/api/upload",
        files=[
            ("files", ("good.png", image_bytes("PNG"), "image/png")),
            ("files", ("bad.html", b"<html></html>", "image/png")),
        ],
    )

    assert response.status_code == 422
    assert os.listdir(client.upload_dir) == []


# ---- F3 (final checkpoint): size and count limits; files stream to disk, nothing left behind


def test_a_file_over_the_size_limit_is_413_and_nothing_is_written(client, monkeypatch):
    monkeypatch.setattr("server.main.MAX_UPLOAD_FILE_BYTES", 200)
    monkeypatch.setattr("server.main.UPLOAD_CHUNK_BYTES", 64)
    big = image_bytes("BMP")  # uncompressed 9x7 BMP: over 200 bytes; the PNG is under
    assert len(big) > 200 > len(image_bytes("PNG"))

    response = client.post(
        "/api/upload",
        files=[
            ("files", ("small.png", image_bytes("PNG"), "image/png")),
            ("files", ("big.bmp", big, "image/bmp")),
        ],
    )

    assert response.status_code == 413
    assert "big.bmp" in response.json()["detail"]
    assert os.listdir(client.upload_dir) == []


def test_a_batch_over_the_total_limit_is_413(client, monkeypatch):
    monkeypatch.setattr("server.main.MAX_UPLOAD_BATCH_BYTES", len(image_bytes("PNG")) + 10)
    files = [("files", (f"p{i}.png", image_bytes("PNG"), "image/png")) for i in range(3)]

    response = client.post("/api/upload", files=files)

    assert response.status_code == 413
    assert os.listdir(client.upload_dir) == []


def test_more_files_than_the_count_limit_is_413(client, monkeypatch):
    monkeypatch.setattr("server.main.MAX_UPLOAD_FILES", 2)
    files = [("files", (f"p{i}.png", image_bytes("PNG"), "image/png")) for i in range(3)]

    response = client.post("/api/upload", files=files)

    assert response.status_code == 413
    assert os.listdir(client.upload_dir) == []


def test_a_batch_within_the_limits_keeps_its_order_and_leaves_no_part_files(client):
    names = [f"img{i}.png" for i in range(5)]
    response = client.post("/api/upload", files=[("files", (name, image_bytes("PNG"), "image/png")) for name in names])

    assert response.status_code == 200
    assert [item["name"] for item in response.json()["files"]] == names
    stored = os.listdir(client.upload_dir)
    assert len(stored) == 5
    assert not any(name.endswith(".part") for name in stored)
