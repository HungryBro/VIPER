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


def png_bytes() -> bytes:
    from io import BytesIO

    from PIL import Image

    buffer = BytesIO()
    Image.new("RGB", (4, 4), (10, 20, 30)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_successful_upload_creates_processing_activity_log(monkeypatch, tmp_path):
    engine = make_engine()
    Base.metadata.create_all(engine)
    learner = add_user(engine, "learner", "learner@example.com")

    # /api/upload ตรวจชนิดจากเนื้อหาจริง (C2) จึงส่งภาพ PNG จริง และเขียนไฟล์ลง tmp_path แทน outputs/uploads
    monkeypatch.setattr("server.main.UPLOAD_DIR", str(tmp_path))

    try:
        with make_client(engine) as client:
            authenticate(client, learner.id)
            response = client.post(
                "/api/upload",
                files={"files": ("sample.png", png_bytes(), "image/png")},
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


# ---- T10: แบ่งหน้า ตัวกรอง ยอดรวม ----------------------------------------

def seed_many_logs(engine, admin_id: int, count: int = 53) -> None:
    """สร้าง log มากกว่าหนึ่งหน้า โดยบางแถวมี created_at เท่ากัน เพื่อทดสอบการเรียงที่คงที่"""
    from datetime import datetime, timedelta, timezone

    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    actions = ["auth.login", "template.create", "processing.run", "permission.can_teach_update"]
    with Session(engine) as db:
        for index in range(count):
            db.add(
                AuditLog(
                    actor_id=admin_id,
                    action=actions[index % len(actions)],
                    target_type="template" if index % 2 == 0 else "processing",
                    target_id=f"target-{index}",
                    details={"index": index},
                    request_path=f"/api/path/{index}",
                    status_code=200 if index % 5 else 500,
                    created_at=base + timedelta(minutes=index // 3),
                )
            )
        db.commit()


def fetch_all_pages(client, page_size: int, query: str = ""):
    ids: list[int] = []
    totals: set[str] = set()
    offset = 0
    while True:
        response = client.get(
            f"/api/admin/audit-logs?limit={page_size}&offset={offset}{query}"
        )
        assert response.status_code == 200
        totals.add(response.headers["X-Total-Count"])
        page = response.json()
        ids.extend(item["id"] for item in page)
        if len(page) < page_size:
            return ids, totals
        offset += page_size


def test_paging_through_every_page_returns_each_id_once_and_total_matches():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    seed_many_logs(engine, admin.id, 53)

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            ids, totals = fetch_all_pages(client, page_size=10)

        with Session(engine) as db:
            all_ids = set(db.scalars(select(AuditLog.id)).all())
        assert len(ids) == len(set(ids)) == 53
        assert set(ids) == all_ids
        assert totals == {"53"}
    finally:
        app.dependency_overrides.clear()


def test_audit_log_order_is_newest_first_with_id_tiebreak():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    seed_many_logs(engine, admin.id, 20)

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            rows = client.get("/api/admin/audit-logs?limit=500").json()
        keys = [(row["created_at"], row["id"]) for row in rows]
        assert keys == sorted(keys, reverse=True)
    finally:
        app.dependency_overrides.clear()


def test_action_filter_is_applied_on_the_server_with_matching_total():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    seed_many_logs(engine, admin.id, 53)

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            single = client.get("/api/admin/audit-logs?action=processing.run&limit=500")
            multi = client.get(
                "/api/admin/audit-logs?action=processing.run&action=auth.login&limit=5"
            )
            prefix = client.get(
                "/api/admin/audit-logs?action_prefix=template.&action_prefix=permission.&limit=500"
            )

        expected_processing = len([i for i in range(53) if i % 4 == 2])
        assert single.status_code == 200
        assert {row["action"] for row in single.json()} == {"processing.run"}
        assert len(single.json()) == expected_processing
        assert single.headers["X-Total-Count"] == str(expected_processing)

        expected_multi = len([i for i in range(53) if i % 4 in (0, 2)])
        assert len(multi.json()) == 5
        assert multi.headers["X-Total-Count"] == str(expected_multi)

        assert {row["action"] for row in prefix.json()} == {
            "template.create",
            "permission.can_teach_update",
        }
        assert prefix.headers["X-Total-Count"] == str(len(prefix.json()))
    finally:
        app.dependency_overrides.clear()


def test_search_q_is_applied_on_the_server_across_fields_and_escapes_wildcards():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    other = add_user(engine, "other", "somchai@example.com")
    seed_many_logs(engine, admin.id, 10)
    with Session(engine) as db:
        db.add(
            AuditLog(
                actor_id=other.id,
                action="comment.create",
                target_type="comment",
                target_id="100%_special",
                details={},
                request_path="/api/comments",
                status_code=201,
            )
        )
        db.commit()

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            by_email = client.get("/api/admin/audit-logs?q=SOMCHAI")
            by_target = client.get("/api/admin/audit-logs?q=target-7")
            by_path = client.get("/api/admin/audit-logs?q=/api/comments")
            by_action = client.get("/api/admin/audit-logs?q=comment.create")
            wildcard = client.get("/api/admin/audit-logs?q=%25")
            wildcard_literal = client.get("/api/admin/audit-logs?q=100%25_")
            combined = client.get("/api/admin/audit-logs?q=target&action=auth.login")

        assert [r["action"] for r in by_email.json()] == ["comment.create"]
        assert by_email.headers["X-Total-Count"] == "1"
        assert [r["target_id"] for r in by_target.json()] == ["target-7"]
        assert len(by_path.json()) == 1
        assert len(by_action.json()) == 1
        # "%" ต้องเป็นตัวอักษรจริง ไม่ใช่ wildcard (มีเฉพาะแถวที่ target_id มี %)
        assert [r["target_id"] for r in wildcard.json()] == ["100%_special"]
        assert [r["target_id"] for r in wildcard_literal.json()] == ["100%_special"]
        assert {r["action"] for r in combined.json()} == {"auth.login"}
        assert combined.headers["X-Total-Count"] == str(len(combined.json()))
    finally:
        app.dependency_overrides.clear()


def test_legacy_call_without_new_params_keeps_list_shape_and_limit():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    seed_many_logs(engine, admin.id, 53)

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            response = client.get("/api/admin/audit-logs?limit=200")
            default = client.get("/api/admin/audit-logs")
            too_big = client.get("/api/admin/audit-logs?limit=501")
            bad_offset = client.get("/api/admin/audit-logs?offset=-1")

        assert response.status_code == 200
        assert isinstance(response.json(), list)
        assert len(response.json()) == 53
        assert len(default.json()) == 53
        assert set(response.json()[0]) == {
            "id", "actor_id", "actor", "action", "target_type", "target_id",
            "details", "request_path", "status_code", "created_at",
        }
        assert too_big.status_code == 422
        assert bad_offset.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_audit_action_counts_lists_every_distinct_action():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    seed_many_logs(engine, admin.id, 53)

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            response = client.get("/api/admin/audit-logs/actions")

        assert response.status_code == 200
        body = response.json()
        counts = {row["action"]: row["count"] for row in body}
        assert set(counts) == {
            "auth.login", "template.create", "processing.run", "permission.can_teach_update",
        }
        assert sum(counts.values()) == 53
        assert [row["action"] for row in body] == sorted(counts)
    finally:
        app.dependency_overrides.clear()


def test_new_audit_endpoints_reject_regular_users_and_anonymous():
    engine = make_engine()
    Base.metadata.create_all(engine)
    learner = add_user(engine, "learner", "learner@example.com")

    try:
        with make_client(engine) as client:
            anonymous = [
                client.get("/api/admin/audit-logs?offset=0&q=x"),
                client.get("/api/admin/audit-logs/actions"),
            ]
            authenticate(client, learner.id)
            forbidden = [
                client.get("/api/admin/audit-logs?offset=0&q=x"),
                client.get("/api/admin/audit-logs/actions"),
            ]

        assert [r.status_code for r in anonymous] == [401, 401]
        assert [r.status_code for r in forbidden] == [403, 403]
    finally:
        app.dependency_overrides.clear()


# ---- A5d (หลังจุดตรวจ 2): แถวที่ไม่มี actor ---------------------------------

def test_paging_and_search_include_rows_without_an_actor():
    from datetime import datetime, timedelta, timezone

    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    seed_many_logs(engine, admin.id, 20)
    base = datetime(2026, 2, 1, tzinfo=timezone.utc)
    with Session(engine) as db:
        for index in range(7):
            db.add(
                AuditLog(
                    actor_id=None,
                    action="auth.login_failed",
                    target_type="auth",
                    target_id=None,
                    details={},
                    request_path=f"/api/auth/anonymous-{index}",
                    status_code=401,
                    created_at=base + timedelta(minutes=index // 2),
                )
            )
        db.commit()

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            ids, totals = fetch_all_pages(client, page_size=6)
            found = client.get("/api/admin/audit-logs?limit=50&q=anonymous-4")

        with Session(engine) as db:
            all_ids = set(db.scalars(select(AuditLog.id)).all())
            target = db.scalar(select(AuditLog.id).where(AuditLog.request_path == "/api/auth/anonymous-4"))
        assert len(ids) == len(set(ids)) == 27
        assert set(ids) == all_ids
        assert totals == {"27"}
        assert found.status_code == 200
        assert [item["id"] for item in found.json()] == [target]
        assert found.json()[0]["actor"] is None
        assert found.headers["X-Total-Count"] == "1"
    finally:
        app.dependency_overrides.clear()
