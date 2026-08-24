from base64 import b64encode
from datetime import timedelta
import json
import os

os.environ["AUTO_CREATE_TABLES"] = "false"

from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from server.auth import utc_now
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


def session_cookie(user_id: int) -> str:
    payload = b64encode(json.dumps({"user_id": user_id}).encode("utf-8"))
    return TimestampSigner(settings.session_secret).sign(payload).decode("utf-8")


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
    client.cookies.set(
        "viper_session",
        session_cookie(user_id),
        domain="testserver.local",
        path="/",
    )


def test_admin_can_list_users_and_change_role_with_audit_log():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin-subject", "owner@example.com", role="admin")
    learner = add_user(engine, "learner-subject", "learner@example.com")

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            listed = client.get("/api/admin/users")
            updated = client.patch(
                f"/api/admin/users/{learner.id}",
                json={"role": "admin"},
            )

        assert listed.status_code == 200
        assert {item["email"] for item in listed.json()} == {
            "owner@example.com",
            "learner@example.com",
        }
        assert updated.status_code == 200
        assert updated.json()["role"] == "admin"

        with Session(engine) as db:
            saved = db.get(User, learner.id)
            audit = db.scalar(
                select(AuditLog).where(
                    AuditLog.action == "admin.user_access_updated",
                    AuditLog.target_id == str(learner.id),
                )
            )
            assert saved.role == "admin"
            assert audit.actor_id == admin.id
            assert audit.details["changes"]["role"] == {
                "from": "user",
                "to": "admin",
            }
    finally:
        app.dependency_overrides.clear()


def test_admin_can_temporarily_ban_and_unban_user():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin-subject", "owner@example.com", role="admin")
    learner = add_user(engine, "learner-subject", "learner@example.com")
    banned_until = utc_now() + timedelta(hours=24)

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            banned = client.patch(
                f"/api/admin/users/{learner.id}",
                json={
                    "status": "banned",
                    "banned_until": banned_until.isoformat(),
                },
            )

            authenticate(client, learner.id)
            blocked = client.get("/api/auth/me")

            authenticate(client, admin.id)
            restored = client.patch(
                f"/api/admin/users/{learner.id}",
                json={"status": "active"},
            )

            authenticate(client, learner.id)
            active = client.get("/api/auth/me")

        assert banned.status_code == 200
        assert banned.json()["status"] == "banned"
        assert blocked.status_code == 403
        assert restored.status_code == 200
        assert restored.json()["status"] == "active"
        assert restored.json()["banned_until"] is None
        assert active.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_regular_user_cannot_access_admin_endpoints():
    engine = make_engine()
    Base.metadata.create_all(engine)
    learner = add_user(engine, "learner-subject", "learner@example.com")

    try:
        with make_client(engine) as client:
            authenticate(client, learner.id)
            response = client.get("/api/admin/users")

        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_admin_cannot_ban_or_demote_self():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin-subject", "owner@example.com", role="admin")

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            demote = client.patch(
                f"/api/admin/users/{admin.id}",
                json={"role": "user"},
            )
            ban = client.patch(
                f"/api/admin/users/{admin.id}",
                json={
                    "status": "banned",
                    "banned_until": (utc_now() + timedelta(hours=1)).isoformat(),
                },
            )

        assert demote.status_code == 400
        assert ban.status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_temporary_ban_requires_future_timezone_aware_expiry():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin-subject", "owner@example.com", role="admin")
    learner = add_user(engine, "learner-subject", "learner@example.com")

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            missing = client.patch(
                f"/api/admin/users/{learner.id}",
                json={"status": "banned"},
            )
            past = client.patch(
                f"/api/admin/users/{learner.id}",
                json={
                    "status": "banned",
                    "banned_until": (utc_now() - timedelta(minutes=1)).isoformat(),
                },
            )
            naive = client.patch(
                f"/api/admin/users/{learner.id}",
                json={
                    "status": "banned",
                    "banned_until": "2030-01-01T00:00:00",
                },
            )

        assert missing.status_code == 422
        assert past.status_code == 422
        assert naive.status_code == 422
    finally:
        app.dependency_overrides.clear()
