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

from server.auth import oauth, require_admin, sync_google_user, utc_now
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
    client = TestClient(app)
    return client


def add_user(engine, **overrides) -> User:
    values = {
        "provider_subject": "google-user-1",
        "email": "learner@example.com",
        "display_name": "VIPER Learner",
    }
    values.update(overrides)
    with Session(engine) as db:
        user = User(**values)
        db.add(user)
        db.commit()
        db.refresh(user)
        db.expunge(user)
        return user


def test_me_requires_authentication():
    engine = make_engine()
    Base.metadata.create_all(engine)

    with make_client(engine) as client:
        response = client.get("/api/auth/me")

    app.dependency_overrides.clear()
    assert response.status_code == 401


def test_processing_api_requires_authentication():
    engine = make_engine()
    Base.metadata.create_all(engine)

    with make_client(engine) as client:
        response = client.post(
            "/api/feature/sift",
            json={"image_path": "/missing/image.png", "params": {}},
        )

    app.dependency_overrides.clear()
    assert response.status_code == 401


def test_me_returns_session_user_and_logout_clears_session():
    engine = make_engine()
    Base.metadata.create_all(engine)
    user = add_user(engine)

    with make_client(engine) as client:
        client.cookies.set(
            "viper_session",
            session_cookie(user.id),
            domain="testserver.local",
            path="/",
        )
        me_response = client.get("/api/auth/me")
        logout_response = client.post("/api/auth/logout")
        after_logout = client.get("/api/auth/me")

    app.dependency_overrides.clear()
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "learner@example.com"
    assert logout_response.status_code == 200
    assert after_logout.status_code == 401

    with Session(engine) as db:
        assert db.scalar(select(AuditLog).where(AuditLog.action == "auth.logout"))


def test_banned_user_is_blocked_and_expired_ban_is_cleared():
    engine = make_engine()
    Base.metadata.create_all(engine)
    banned = add_user(
        engine,
        status="banned",
        banned_until=utc_now() + timedelta(hours=1),
    )

    with make_client(engine) as client:
        client.cookies.set(
            "viper_session",
            session_cookie(banned.id),
            domain="testserver.local",
            path="/",
        )
        blocked = client.get("/api/auth/me")

        with Session(engine) as db:
            saved = db.get(User, banned.id)
            saved.banned_until = utc_now() - timedelta(minutes=1)
            db.commit()

        restored = client.get("/api/auth/me")

    app.dependency_overrides.clear()
    assert blocked.status_code == 403
    assert restored.status_code == 200
    assert restored.json()["status"] == "active"


def test_google_callback_upserts_user_and_sets_session(monkeypatch):
    engine = make_engine()
    Base.metadata.create_all(engine)

    async def fake_authorize_access_token(request):
        return {
            "userinfo": {
                "sub": "google-callback-user",
                "email": "callback@example.com",
                "email_verified": True,
                "name": "Callback User",
                "picture": "https://example.com/avatar.png",
            }
        }

    monkeypatch.setattr(oauth.google, "authorize_access_token", fake_authorize_access_token)

    with make_client(engine) as client:
        callback = client.get("/api/auth/google/callback", follow_redirects=False)
        me_response = client.get("/api/auth/me")

    app.dependency_overrides.clear()
    assert callback.status_code == 302
    assert callback.headers["location"] == settings.frontend_url
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "callback@example.com"

    with Session(engine) as db:
        assert db.scalar(select(AuditLog).where(AuditLog.action == "auth.login"))


def test_google_user_sync_is_idempotent_and_admin_dependency_is_strict():
    engine = make_engine()
    Base.metadata.create_all(engine)

    user_info = {
        "sub": "same-google-user",
        "email": "same@example.com",
        "email_verified": True,
        "name": "First Name",
    }
    with Session(engine) as db:
        first = sync_google_user(db, user_info)
        db.commit()
        first_id = first.id

        user_info["name"] = "Updated Name"
        second = sync_google_user(db, user_info)
        db.commit()

        assert second.id == first_id
        assert second.display_name == "Updated Name"
        assert len(db.scalars(select(User)).all()) == 1

        second.role = "admin"
        assert require_admin(second) is second
