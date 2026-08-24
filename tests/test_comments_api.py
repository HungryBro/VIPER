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


def workflow() -> dict:
    return {"version": 1, "nodes": [], "edges": []}


def create_public_template(client: TestClient, owner_id: int) -> int:
    authenticate(client, owner_id)
    response = client.post(
        "/api/templates",
        json={"name": "Commentable", "visibility": "public", "workflow": workflow()},
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_user_can_write_and_read_template_comments():
    engine = make_engine()
    Base.metadata.create_all(engine)
    owner = add_user(engine, "owner", "owner@example.com")
    viewer = add_user(engine, "viewer", "viewer@example.com")

    try:
        with make_client(engine) as client:
            template_id = create_public_template(client, owner.id)
            authenticate(client, viewer.id)
            created = client.post(
                f"/api/templates/{template_id}/comments",
                json={"body": "  Very useful workflow  "},
            )
            comments = client.get(f"/api/templates/{template_id}/comments")

            authenticate(client, owner.id)
            forbidden_delete = client.delete(
                f"/api/templates/{template_id}/comments/{created.json()['id']}"
            )

            authenticate(client, viewer.id)
            deleted = client.delete(
                f"/api/templates/{template_id}/comments/{created.json()['id']}"
            )
            comments_after_delete = client.get(f"/api/templates/{template_id}/comments")

        assert created.status_code == 201
        assert created.json()["body"] == "Very useful workflow"
        assert created.json()["author"]["display_name"] == "viewer"
        assert [comment["body"] for comment in comments.json()] == ["Very useful workflow"]
        assert forbidden_delete.status_code == 403
        assert forbidden_delete.json()["detail"] == "You can only delete your own comments"
        assert deleted.status_code == 204
        assert comments_after_delete.json() == []

        with Session(engine) as db:
            audits = db.scalars(
                select(AuditLog)
                .where(AuditLog.action.in_(["comment.create", "comment.delete"]))
                .order_by(AuditLog.id)
            ).all()
            assert [audit.action for audit in audits] == ["comment.create", "comment.delete"]
            assert all(audit.actor_id == viewer.id for audit in audits)
            assert all(audit.details == {"template_id": template_id} for audit in audits)
    finally:
        app.dependency_overrides.clear()


def test_admin_can_disable_writes_while_existing_comments_remain_readable():
    engine = make_engine()
    Base.metadata.create_all(engine)
    owner = add_user(engine, "owner", "owner@example.com")
    viewer = add_user(engine, "viewer", "viewer@example.com")
    admin = add_user(engine, "admin", "admin@example.com", role="admin")

    try:
        with make_client(engine) as client:
            template_id = create_public_template(client, owner.id)
            authenticate(client, viewer.id)
            before = client.post(
                f"/api/templates/{template_id}/comments",
                json={"body": "Written before closing"},
            )

            authenticate(client, admin.id)
            disabled = client.patch(
                f"/api/admin/templates/{template_id}/comments",
                json={"comments_enabled": False},
            )

            authenticate(client, viewer.id)
            still_readable = client.get(f"/api/templates/{template_id}/comments")
            blocked = client.post(
                f"/api/templates/{template_id}/comments",
                json={"body": "Should be blocked"},
            )
            deleted_while_closed = client.delete(
                f"/api/templates/{template_id}/comments/{before.json()['id']}"
            )
            comments_after_delete = client.get(f"/api/templates/{template_id}/comments")

            authenticate(client, admin.id)
            enabled = client.patch(
                f"/api/admin/templates/{template_id}/comments",
                json={"comments_enabled": True},
            )

            authenticate(client, viewer.id)
            after = client.post(
                f"/api/templates/{template_id}/comments",
                json={"body": "Written after reopening"},
            )

        assert before.status_code == 201
        assert disabled.status_code == 200
        assert disabled.json()["comments_enabled"] is False
        assert still_readable.status_code == 200
        assert [item["body"] for item in still_readable.json()] == ["Written before closing"]
        assert blocked.status_code == 403
        assert blocked.json()["detail"] == "Comments are disabled for this template"
        assert deleted_while_closed.status_code == 204
        assert comments_after_delete.json() == []
        assert enabled.status_code == 200
        assert enabled.json()["comments_enabled"] is True
        assert after.status_code == 201

        with Session(engine) as db:
            audits = db.scalars(
                select(AuditLog).where(
                    AuditLog.action == "admin.template_comments_updated"
                )
            ).all()
            assert len(audits) == 2
            assert audits[0].details["comments_enabled"] == {"from": True, "to": False}
            assert audits[1].details["comments_enabled"] == {"from": False, "to": True}
    finally:
        app.dependency_overrides.clear()


def test_non_admin_cannot_change_comment_setting():
    engine = make_engine()
    Base.metadata.create_all(engine)
    owner = add_user(engine, "owner", "owner@example.com")

    try:
        with make_client(engine) as client:
            template_id = create_public_template(client, owner.id)
            response = client.patch(
                f"/api/admin/templates/{template_id}/comments",
                json={"comments_enabled": False},
            )

        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_private_template_comments_are_hidden_and_payload_is_validated():
    engine = make_engine()
    Base.metadata.create_all(engine)
    owner = add_user(engine, "owner", "owner@example.com")
    viewer = add_user(engine, "viewer", "viewer@example.com")

    try:
        with make_client(engine) as client:
            authenticate(client, owner.id)
            created = client.post(
                "/api/templates",
                json={"name": "Private", "visibility": "private", "workflow": workflow()},
            )
            template_id = created.json()["id"]
            blank = client.post(
                f"/api/templates/{template_id}/comments",
                json={"body": "   "},
            )

            authenticate(client, viewer.id)
            hidden_list = client.get(f"/api/templates/{template_id}/comments")
            hidden_create = client.post(
                f"/api/templates/{template_id}/comments",
                json={"body": "Cannot see this"},
            )

        assert blank.status_code == 422
        assert hidden_list.status_code == 404
        assert hidden_create.status_code == 404
    finally:
        app.dependency_overrides.clear()
