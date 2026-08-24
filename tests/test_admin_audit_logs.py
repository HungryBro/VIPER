from base64 import b64encode
import json
import os

os.environ["AUTO_CREATE_TABLES"] = "false"

from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from server.config import settings
from server.database import Base, get_db
from server.main import app
from server.models import AuditLog, User


def make_engine():
    return create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


def make_client(engine):
    def override_get_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def add_user(engine, subject: str, email: str, role: str = "user") -> User:
    with Session(engine) as db:
        user = User(
            provider_subject=subject,
            email=email,
            display_name=email.split("@", 1)[0],
            role=role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        db.expunge(user)
        return user


def authenticate(client: TestClient, user_id: int) -> None:
    payload = b64encode(json.dumps({"user_id": user_id}).encode("utf-8"))
    cookie = TimestampSigner(settings.session_secret).sign(payload).decode("utf-8")
    client.cookies.set("viper_session", cookie, domain="testserver.local", path="/")


def test_admin_can_read_latest_audit_logs_but_cannot_mutate_them():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin", "admin@example.com", role="admin")

    with Session(engine) as db:
        db.add_all(
            [
                AuditLog(
                    actor_id=admin.id,
                    action="auth.login",
                    target_type="user",
                    target_id=str(admin.id),
                    details={"provider": "google"},
                    request_path="/api/auth/google/callback",
                    status_code=302,
                ),
                AuditLog(
                    actor_id=admin.id,
                    action="template.create",
                    target_type="template",
                    target_id="42",
                    details={"visibility": "public"},
                    request_path="/api/templates",
                    status_code=201,
                ),
            ]
        )
        db.commit()

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            response = client.get("/api/admin/audit-logs?limit=1")
            delete_response = client.delete("/api/admin/audit-logs")

        assert response.status_code == 200
        assert len(response.json()) == 1
        latest = response.json()[0]
        assert latest["action"] == "template.create"
        assert latest["actor"]["email"] == "admin@example.com"
        assert latest["details"] == {"visibility": "public"}
        assert delete_response.status_code == 405
    finally:
        app.dependency_overrides.clear()


def test_regular_user_cannot_read_audit_logs():
    engine = make_engine()
    Base.metadata.create_all(engine)
    learner = add_user(engine, "learner", "learner@example.com")

    try:
        with make_client(engine) as client:
            authenticate(client, learner.id)
            response = client.get("/api/admin/audit-logs")

        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_processing_request_creates_activity_log_for_the_current_user():
    engine = make_engine()
    Base.metadata.create_all(engine)
    learner = add_user(engine, "learner", "learner@example.com")

    try:
        with make_client(engine) as client:
            authenticate(client, learner.id)
            response = client.post(
                "/api/feature/orb",
                json={"image_path": "/missing/audit-test.png", "params": {}},
            )

        assert response.status_code == 404
        with Session(engine) as db:
            audit = db.scalar(
                select(AuditLog).where(
                    AuditLog.action == "processing.run",
                    AuditLog.actor_id == learner.id,
                )
            )
            assert audit is not None
            assert audit.target_type == "processing"
            assert audit.target_id == "feature.orb"
            assert audit.request_path == "/api/feature/orb"
            assert audit.status_code == 404
            assert audit.details["category"] == "feature"
            assert audit.details["success"] is False
            assert audit.details["duration_ms"] >= 0
    finally:
        app.dependency_overrides.clear()


def test_successful_upload_creates_processing_activity_log(monkeypatch, tmp_path):
    engine = make_engine()
    Base.metadata.create_all(engine)
    learner = add_user(engine, "learner", "learner@example.com")

    async def fake_save_upload(file, _destination):
        await file.read()
        return str(tmp_path / (file.filename or "upload.bin"))

    monkeypatch.setattr("server.main.save_upload", fake_save_upload)

    try:
        with make_client(engine) as client:
            authenticate(client, learner.id)
            response = client.post(
                "/api/upload",
                files={"files": ("sample.png", b"image-data", "image/png")},
            )

        assert response.status_code == 200
        with Session(engine) as db:
            audit = db.scalar(
                select(AuditLog).where(
                    AuditLog.action == "processing.upload",
                    AuditLog.actor_id == learner.id,
                )
            )
            assert audit is not None
            assert audit.target_id == "upload"
            assert audit.status_code == 200
            assert audit.details["success"] is True
    finally:
        app.dependency_overrides.clear()
