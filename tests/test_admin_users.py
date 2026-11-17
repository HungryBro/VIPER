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


def test_admin_can_list_users_and_change_role_with_permission_log():
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
                    AuditLog.action == "permission.role_update",
                    AuditLog.target_id == str(learner.id),
                )
            )
            assert saved.role == "admin"
            assert audit.actor_id == admin.id
            assert audit.details["role"] == {
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

        with Session(engine) as db:
            actions = db.scalars(
                select(AuditLog.action)
                .where(AuditLog.target_id == str(learner.id))
                .order_by(AuditLog.id)
            ).all()
            assert "ban.apply" in actions
            assert "ban.remove" in actions
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


def test_admin_can_grant_and_revoke_can_teach_with_permission_log():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin-subject", "owner@example.com", role="admin")
    learner = add_user(engine, "learner-subject", "learner@example.com")

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            listed_before = client.get("/api/admin/users")
            granted = client.patch(f"/api/admin/users/{learner.id}", json={"can_teach": True})
            repeated = client.patch(f"/api/admin/users/{learner.id}", json={"can_teach": True})
            listed_after = client.get("/api/admin/users")
            revoked = client.patch(f"/api/admin/users/{learner.id}", json={"can_teach": False})

        assert listed_before.status_code == 200
        assert {item["email"]: item["can_teach"] for item in listed_before.json()} == {
            "owner@example.com": False,
            "learner@example.com": False,
        }
        assert granted.status_code == 200
        assert granted.json()["can_teach"] is True
        assert granted.json()["role"] == "user"
        assert repeated.status_code == 200
        assert {item["email"]: item["can_teach"] for item in listed_after.json()}["learner@example.com"] is True
        assert revoked.status_code == 200
        assert revoked.json()["can_teach"] is False

        with Session(engine) as db:
            saved = db.get(User, learner.id)
            logs = db.scalars(
                select(AuditLog)
                .where(
                    AuditLog.action == "permission.can_teach_update",
                    AuditLog.target_id == str(learner.id),
                )
                .order_by(AuditLog.id)
            ).all()
            assert saved.can_teach is False
            assert saved.role == "user"
            # The repeated grant changed nothing, so it is not logged.
            assert [log.details["can_teach"] for log in logs] == [
                {"from": False, "to": True},
                {"from": True, "to": False},
            ]
            assert all(log.actor_id == admin.id for log in logs)
            assert all(log.target_type == "user" for log in logs)
    finally:
        app.dependency_overrides.clear()


def test_can_teach_update_requires_admin_and_login():
    engine = make_engine()
    Base.metadata.create_all(engine)
    learner = add_user(engine, "learner-subject", "learner@example.com")
    teacher = add_user(engine, "teacher-subject", "teacher@example.com")
    with Session(engine) as db:
        db.get(User, teacher.id).can_teach = True
        db.commit()

    try:
        with make_client(engine) as client:
            anonymous = client.patch(f"/api/admin/users/{learner.id}", json={"can_teach": True})

            authenticate(client, learner.id)
            learner_self = client.patch(f"/api/admin/users/{learner.id}", json={"can_teach": True})

            # Teaching permission does not grant user management.
            authenticate(client, teacher.id)
            teacher_other = client.patch(f"/api/admin/users/{learner.id}", json={"can_teach": True})
            teacher_list = client.get("/api/admin/users")

        assert anonymous.status_code == 401
        assert learner_self.status_code == 403
        assert teacher_other.status_code == 403
        assert teacher_list.status_code == 403

        with Session(engine) as db:
            assert db.get(User, learner.id).can_teach is False
            assert db.scalars(
                select(AuditLog).where(AuditLog.action == "permission.can_teach_update")
            ).all() == []
    finally:
        app.dependency_overrides.clear()


def test_can_teach_update_rejects_null_and_unknown_user():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin-subject", "owner@example.com", role="admin")
    learner = add_user(engine, "learner-subject", "learner@example.com")

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            null_value = client.patch(f"/api/admin/users/{learner.id}", json={"can_teach": None})
            not_bool = client.patch(f"/api/admin/users/{learner.id}", json={"can_teach": "yes"})
            missing = client.patch("/api/admin/users/9999", json={"can_teach": True})

        assert null_value.status_code == 422
        assert not_bool.status_code == 422
        assert missing.status_code == 404
        with Session(engine) as db:
            assert db.get(User, learner.id).can_teach is False
    finally:
        app.dependency_overrides.clear()


def test_admin_can_set_own_can_teach_and_auth_me_returns_it():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin-subject", "owner@example.com", role="admin")
    learner = add_user(engine, "learner-subject", "learner@example.com")

    try:
        with make_client(engine) as client:
            authenticate(client, learner.id)
            me_before = client.get("/api/auth/me")

            authenticate(client, admin.id)
            own = client.patch(f"/api/admin/users/{admin.id}", json={"can_teach": True})
            client.patch(f"/api/admin/users/{learner.id}", json={"can_teach": True})

            authenticate(client, learner.id)
            me_after = client.get("/api/auth/me")

        assert me_before.status_code == 200
        assert me_before.json()["can_teach"] is False
        # can_teach cannot lock an administrator out, so changing it on oneself is allowed.
        assert own.status_code == 200
        assert own.json()["can_teach"] is True
        assert own.json()["role"] == "admin"
        assert me_after.status_code == 200
        assert me_after.json()["can_teach"] is True
    finally:
        app.dependency_overrides.clear()
