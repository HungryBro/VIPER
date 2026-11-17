from base64 import b64encode
from datetime import datetime, timedelta, timezone
import json
import os

os.environ["AUTO_CREATE_TABLES"] = "false"

from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from server.config import settings
from server.database import Base, get_db
from server.main import app
from server.models import AuditLog, Template, User

NOW = datetime(2026, 1, 10, 12, 0, tzinfo=timezone.utc)


def make_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return engine


def make_client(engine):
    def override_get_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def add_user(engine, subject: str, **extra) -> User:
    with Session(engine) as db:
        user = User(
            provider_subject=subject,
            email=f"{subject}@example.com",
            display_name=subject,
            **extra,
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


def add_log(db, actor_id, action, minutes=0, details=None, target_id=None):
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            target_type="processing" if action.startswith("processing") else "template",
            target_id=target_id,
            details=details or {},
            request_path="/api/x",
            status_code=200,
            created_at=NOW + timedelta(minutes=minutes),
        )
    )


def add_template(db, owner_id, name, visibility="private", deleted=False):
    db.add(
        Template(
            owner_id=owner_id,
            name=name,
            visibility=visibility,
            workflow={"version": 1, "nodes": [], "edges": []},
            deleted_at=NOW if deleted else None,
        )
    )


def test_me_endpoints_require_login():
    engine = make_engine()
    try:
        with make_client(engine) as client:
            assert client.get("/api/me/activity").status_code == 401
            assert client.get("/api/me/summary").status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_banned_user_is_refused_like_other_endpoints():
    engine = make_engine()
    banned = add_user(
        engine, "banned", status="banned", banned_until=datetime.now(timezone.utc) + timedelta(days=1)
    )
    try:
        with make_client(engine) as client:
            authenticate(client, banned.id)
            assert client.get("/api/me/activity").status_code == 403
            assert client.get("/api/me/summary").status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_activity_returns_only_the_callers_rows_and_ignores_client_user_id():
    engine = make_engine()
    alice = add_user(engine, "alice")
    bob = add_user(engine, "bob")
    with Session(engine) as db:
        add_log(db, alice.id, "processing.run", 1)
        add_log(db, bob.id, "processing.run", 2)
        add_log(db, bob.id, "template.create", 3)
        db.commit()
    try:
        with make_client(engine) as client:
            authenticate(client, alice.id)
            response = client.get(f"/api/me/activity?actor_id={bob.id}&user_id={bob.id}")
        assert response.status_code == 200
        rows = response.json()
        assert [r["action"] for r in rows] == ["processing.run"]
        assert response.headers["X-Total-Count"] == "1"
    finally:
        app.dependency_overrides.clear()


def test_activity_paginates_without_gaps_or_duplicates_and_orders_newest_first():
    engine = make_engine()
    alice = add_user(engine, "alice")
    with Session(engine) as db:
        for i in range(7):
            add_log(db, alice.id, "processing.run", i)
        db.commit()
    try:
        with make_client(engine) as client:
            authenticate(client, alice.id)
            seen = []
            for offset in (0, 3, 6):
                response = client.get(f"/api/me/activity?limit=3&offset={offset}")
                assert response.headers["X-Total-Count"] == "7"
                seen.extend(row["id"] for row in response.json())
        assert len(seen) == 7 and len(set(seen)) == 7
        assert seen == sorted(seen, reverse=True)
    finally:
        app.dependency_overrides.clear()


def test_activity_filters_by_action_and_total_follows_the_filter():
    engine = make_engine()
    alice = add_user(engine, "alice")
    with Session(engine) as db:
        add_log(db, alice.id, "processing.run", 1)
        add_log(db, alice.id, "processing.run", 2)
        add_log(db, alice.id, "template.create", 3)
        db.commit()
    try:
        with make_client(engine) as client:
            authenticate(client, alice.id)
            response = client.get("/api/me/activity?action=processing.run")
        assert [r["action"] for r in response.json()] == ["processing.run"] * 2
        assert response.headers["X-Total-Count"] == "2"
    finally:
        app.dependency_overrides.clear()


def test_activity_limits_are_validated():
    engine = make_engine()
    alice = add_user(engine, "alice")
    try:
        with make_client(engine) as client:
            authenticate(client, alice.id)
            assert client.get("/api/me/activity?limit=0").status_code == 422
            assert client.get("/api/me/activity?limit=501").status_code == 422
            assert client.get("/api/me/activity?offset=-1").status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_activity_details_only_expose_allowlisted_keys():
    engine = make_engine()
    alice = add_user(engine, "alice")
    with Session(engine) as db:
        add_log(
            db,
            alice.id,
            "processing.run",
            1,
            details={"category": "feature", "duration_ms": 12, "success": True, "secret": "x"},
        )
        add_log(
            db,
            alice.id,
            "template.delete",
            2,
            details={"name": "n", "owner_id": 99, "deleted_by": {"id": 1, "display_name": "Other"}},
        )
        db.commit()
    try:
        with make_client(engine) as client:
            authenticate(client, alice.id)
            rows = client.get("/api/me/activity").json()
        by_action = {r["action"]: r for r in rows}
        assert by_action["processing.run"]["details"] == {
            "category": "feature",
            "duration_ms": 12,
            "success": True,
        }
        assert by_action["template.delete"]["details"] == {}
        assert "actor" not in rows[0] and "actor_id" not in rows[0]
    finally:
        app.dependency_overrides.clear()


def test_summary_matches_what_was_created_and_ignores_other_users():
    engine = make_engine()
    login = NOW - timedelta(days=1)
    alice = add_user(engine, "alice", last_login_at=login)
    bob = add_user(engine, "bob")
    with Session(engine) as db:
        add_template(db, alice.id, "a1", "private")
        add_template(db, alice.id, "a2", "public")
        add_template(db, alice.id, "a3", "public", deleted=True)
        add_template(db, bob.id, "b1", "public")
        add_log(db, alice.id, "processing.run", 1)
        add_log(db, alice.id, "processing.run", 5)
        add_log(db, alice.id, "processing.upload", 6)
        add_log(db, alice.id, "template.create", 7)
        add_log(db, bob.id, "processing.run", 99)
        db.commit()
    try:
        with make_client(engine) as client:
            authenticate(client, alice.id)
            body = client.get("/api/me/summary").json()
        assert body["template_count"] == 2
        assert body["public_template_count"] == 1
        assert body["run_count"] == 2
        assert body["activity_count"] == 4
        assert body["last_run_at"].startswith("2026-01-10T12:05")
        assert body["last_activity_at"].startswith("2026-01-10T12:07")
        assert body["last_login_at"].startswith("2026-01-09T12:00")
        assert body["member_since"]
    finally:
        app.dependency_overrides.clear()


def test_summary_of_a_new_user_is_zero_and_null():
    engine = make_engine()
    alice = add_user(engine, "alice")
    try:
        with make_client(engine) as client:
            authenticate(client, alice.id)
            body = client.get("/api/me/summary").json()
        assert body["template_count"] == 0
        assert body["public_template_count"] == 0
        assert body["run_count"] == 0
        assert body["activity_count"] == 0
        assert body["last_run_at"] is None
        assert body["last_activity_at"] is None
        assert body["last_login_at"] is None
    finally:
        app.dependency_overrides.clear()
