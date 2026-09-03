from base64 import b64encode
import json
import os
import shutil

os.environ["AUTO_CREATE_TABLES"] = "false"

from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from server.config import settings
from server.database import Base, get_db
from server.main import app
from server.models import AuditLog, Template, User
from server.official_templates import OFFICIAL_TEMPLATE_CATALOG
from server.routers import templates as templates_router
from server.utils_io import OUT


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
    client.cookies.set(
        "viper_session",
        cookie,
        domain="testserver.local",
        path="/",
    )


def workflow(label: str = "SIFT") -> dict:
    return {
        "version": 1,
        "nodes": [
            {
                "id": "node-1",
                "type": "sift",
                "position": {"x": 10, "y": 20},
                "data": {"label": label, "status": "idle"},
            }
        ],
        "edges": [],
    }


def test_private_template_is_owner_only_until_published():
    engine = make_engine()
    Base.metadata.create_all(engine)
    owner = add_user(engine, "owner-subject", "owner@example.com")
    viewer = add_user(engine, "viewer-subject", "viewer@example.com")

    try:
        with make_client(engine) as client:
            authenticate(client, owner.id)
            created = client.post(
                "/api/templates",
                json={
                    "name": "  SIFT starter  ",
                    "description": "  Private lesson  ",
                    "visibility": "private",
                    "workflow": workflow(),
                },
            )
            template_id = created.json()["id"]
            mine = client.get("/api/templates/mine")

            authenticate(client, viewer.id)
            public_before = client.get("/api/templates")
            hidden_detail = client.get(f"/api/templates/{template_id}")
            hidden_load = client.post(f"/api/templates/{template_id}/load")
            forbidden_update = client.patch(
                f"/api/templates/{template_id}",
                json={"name": "Stolen"},
            )

            authenticate(client, owner.id)
            published = client.patch(
                f"/api/templates/{template_id}",
                json={"visibility": "public", "workflow": workflow("Updated SIFT")},
            )

            authenticate(client, viewer.id)
            public_after = client.get("/api/templates")
            loaded = client.post(f"/api/templates/{template_id}/load")

        assert created.status_code == 201
        assert created.json()["name"] == "SIFT starter"
        assert created.json()["description"] == "Private lesson"
        assert [item["id"] for item in mine.json()] == [template_id]
        assert public_before.json() == []
        assert hidden_detail.status_code == 404
        assert hidden_load.status_code == 404
        assert forbidden_update.status_code == 403
        assert published.status_code == 200
        assert published.json()["visibility"] == "public"
        assert [item["id"] for item in public_after.json()] == [template_id]
        assert loaded.status_code == 200
        assert loaded.json()["workflow"]["nodes"][0]["data"]["label"] == "Updated SIFT"

        with Session(engine) as db:
            saved = db.get(Template, template_id)
            actions = set(
                db.scalars(
                    select(AuditLog.action).where(AuditLog.target_id == str(template_id))
                ).all()
            )
            assert saved.owner_id == owner.id
            assert saved.visibility == "public"
            assert {
                "template.create",
                "template.update",
                "template.load",
                "permission.template_visibility_update",
            } <= actions
    finally:
        app.dependency_overrides.clear()


def test_admin_can_read_private_template_but_cannot_update_it():
    engine = make_engine()
    Base.metadata.create_all(engine)
    owner = add_user(engine, "owner-subject", "owner@example.com")
    admin = add_user(engine, "admin-subject", "admin@example.com", role="admin")

    try:
        with make_client(engine) as client:
            authenticate(client, owner.id)
            created = client.post(
                "/api/templates",
                json={"name": "Private", "visibility": "private", "workflow": workflow()},
            )
            template_id = created.json()["id"]

            authenticate(client, admin.id)
            detail = client.get(f"/api/templates/{template_id}")
            loaded = client.post(f"/api/templates/{template_id}/load")
            updated = client.patch(
                f"/api/templates/{template_id}",
                json={"visibility": "public"},
            )

        assert detail.status_code == 200
        assert loaded.status_code == 200
        assert updated.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_template_payload_validation_and_authentication():
    engine = make_engine()
    Base.metadata.create_all(engine)
    owner = add_user(engine, "owner-subject", "owner@example.com")

    try:
        with make_client(engine) as client:
            unauthenticated = client.get("/api/templates")
            authenticate(client, owner.id)
            blank_name = client.post(
                "/api/templates",
                json={"name": "   ", "workflow": workflow()},
            )
            invalid_workflow = client.post(
                "/api/templates",
                json={"name": "Bad version", "workflow": {"version": 2, "nodes": [], "edges": []}},
            )
            created = client.post(
                "/api/templates",
                json={"name": "Valid", "workflow": workflow()},
            )
            empty_update = client.patch(f"/api/templates/{created.json()['id']}", json={})
            null_update = client.patch(
                f"/api/templates/{created.json()['id']}",
                json={"name": None},
            )

        assert unauthenticated.status_code == 401
        assert blank_name.status_code == 422
        assert invalid_workflow.status_code == 422
        assert empty_update.status_code == 422
        assert null_update.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_owner_can_edit_template_details_and_upload_cover():
    engine = make_engine()
    Base.metadata.create_all(engine)
    owner = add_user(engine, "owner", "owner@example.com")
    viewer = add_user(engine, "viewer", "viewer@example.com")
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    cover_dir = os.path.join(OUT, "test-template-covers")
    original_cover_dir = templates_router.TEMPLATE_COVERS_DIR
    templates_router.TEMPLATE_COVERS_DIR = cover_dir

    try:
        with make_client(engine) as client:
            authenticate(client, owner.id)
            created = client.post(
                "/api/templates",
                json={"name": "Original", "visibility": "private", "workflow": workflow()},
            )
            template_id = created.json()["id"]
            edited = client.patch(
                f"/api/templates/{template_id}",
                json={
                    "name": "Edited workflow",
                    "description": "An updated description",
                    "visibility": "public",
                },
            )
            uploaded = client.post(
                f"/api/templates/{template_id}/cover",
                files={"file": ("cover.png", b"fake-png-content", "image/png")},
            )
            served_cover = client.get(uploaded.json()["cover_url"])

            authenticate(client, viewer.id)
            forbidden = client.post(
                f"/api/templates/{template_id}/cover",
                files={"file": ("cover.png", b"fake-png-content", "image/png")},
            )
            authenticate(client, admin.id)
            audit_logs = client.get("/api/admin/audit-logs")

        assert edited.status_code == 200
        assert edited.json()["name"] == "Edited workflow"
        assert edited.json()["description"] == "An updated description"
        assert edited.json()["visibility"] == "public"
        assert uploaded.status_code == 200
        assert uploaded.json()["cover_url"].startswith("/static/test-template-covers/")
        assert served_cover.status_code == 200
        assert served_cover.content == b"fake-png-content"
        assert forbidden.status_code == 403
        assert audit_logs.status_code == 200
        assert any(log["action"] == "template.cover_update" for log in audit_logs.json())

        with Session(engine) as db:
            saved = db.get(Template, template_id)
            actions = set(db.scalars(select(AuditLog.action)).all())
            assert saved.cover_url == uploaded.json()["cover_url"]
            assert {"template.update", "permission.template_visibility_update", "template.cover_update"} <= actions
    finally:
        templates_router.TEMPLATE_COVERS_DIR = original_cover_dir
        shutil.rmtree(cover_dir, ignore_errors=True)
        app.dependency_overrides.clear()


def test_official_templates_support_comments_and_admin_managed_cover():
    engine = make_engine()
    Base.metadata.create_all(engine)
    learner = add_user(engine, "learner", "learner@example.com")
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    cover_dir = os.path.join(OUT, "test-official-template-covers")
    original_cover_dir = templates_router.TEMPLATE_COVERS_DIR
    templates_router.TEMPLATE_COVERS_DIR = cover_dir

    try:
        with make_client(engine) as client:
            authenticate(client, learner.id)
            official = client.get("/api/templates/official")
            official_id = official.json()[0]["id"]
            public = client.get("/api/templates")
            posted_comment = client.post(
                f"/api/templates/{official_id}/comments",
                json={"body": "Helpful official workflow"},
            )
            learner_cover = client.post(
                f"/api/templates/{official_id}/cover",
                files={"file": ("cover.png", b"learner-cover", "image/png")},
            )

            authenticate(client, admin.id)
            admin_cover = client.post(
                f"/api/templates/{official_id}/cover",
                files={"file": ("cover.png", b"admin-cover", "image/png")},
            )
            closed = client.patch(
                f"/api/admin/templates/{official_id}/comments",
                json={"comments_enabled": False},
            )

            authenticate(client, learner.id)
            comments = client.get(f"/api/templates/{official_id}/comments")
            blocked_comment = client.post(
                f"/api/templates/{official_id}/comments",
                json={"body": "A new comment"},
            )

        assert official.status_code == 200
        assert len(official.json()) == len(OFFICIAL_TEMPLATE_CATALOG)
        assert official.json()[0]["is_official"] is True
        assert official.json()[0]["official_key"]
        assert official_id not in [item["id"] for item in public.json()]
        assert posted_comment.status_code == 201
        assert learner_cover.status_code == 403
        assert admin_cover.status_code == 200
        assert admin_cover.json()["cover_url"].startswith("/static/test-official-template-covers/")
        assert closed.status_code == 200
        assert closed.json()["comments_enabled"] is False
        assert comments.status_code == 200
        assert comments.json()[0]["body"] == "Helpful official workflow"
        assert blocked_comment.status_code == 403

        with Session(engine) as db:
            actions = set(db.scalars(select(AuditLog.action)).all())
            assert {"comment.create", "template.cover_update", "permission.comments_update"} <= actions
    finally:
        templates_router.TEMPLATE_COVERS_DIR = original_cover_dir
        shutil.rmtree(cover_dir, ignore_errors=True)
        app.dependency_overrides.clear()
