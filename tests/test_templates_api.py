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
            edited = client.patch(
                f"/api/templates/{official_id}",
                json={"name": "Renamed Official", "description": "Admin-maintained description"},
            )
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
        assert edited.status_code == 200
        assert edited.json()["name"] == "Renamed Official"
        assert edited.json()["description"] == "Admin-maintained description"
        assert edited.json()["visibility"] == "public"
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


# ---------------------------------------------------------------------------
# T8.1: Official template permissions by role (plan.md decision 7)
#
# | role        | create / mark Official | edit / delete Official | comments on/off |
# | admin       | yes                    | yes                    | yes             |
# | can_teach   | yes                    | yes                    | no              |
# | learner     | no                     | no                     | no              |
# ---------------------------------------------------------------------------


def set_can_teach(engine, user_id: int, value: bool = True) -> None:
    with Session(engine) as db:
        db.get(User, user_id).can_teach = value
        db.commit()


def seeded_official_id(client: TestClient) -> int:
    official = client.get("/api/templates/official")
    assert official.status_code == 200
    seeded = [item for item in official.json() if item["official_key"]]
    return seeded[0]["id"]


def template_count(engine) -> int:
    with Session(engine) as db:
        return len(db.scalars(select(Template)).all())


def test_instructor_can_create_official_and_edit_official_details_workflow_and_cover():
    engine = make_engine()
    Base.metadata.create_all(engine)
    teacher = add_user(engine, "teacher", "teacher@example.com")
    learner = add_user(engine, "learner", "learner@example.com")
    set_can_teach(engine, teacher.id)
    cover_dir = os.path.join(OUT, "test-instructor-official-covers")
    original_cover_dir = templates_router.TEMPLATE_COVERS_DIR
    templates_router.TEMPLATE_COVERS_DIR = cover_dir

    try:
        with make_client(engine) as client:
            authenticate(client, teacher.id)
            created = client.post(
                "/api/templates",
                json={"name": "Lesson 1 official", "is_official": True, "workflow": workflow()},
            )
            seeded_id = seeded_official_id(client)
            edited = client.patch(
                f"/api/templates/{seeded_id}",
                json={
                    "name": "Instructor renamed",
                    "description": "Instructor description",
                    "workflow": workflow("Instructor SIFT"),
                },
            )
            cover = client.post(
                f"/api/templates/{seeded_id}/cover",
                files={"file": ("cover.png", b"teacher-cover", "image/png")},
            )
            edited_own_official = client.patch(
                f"/api/templates/{created.json()['id']}",
                json={"workflow": workflow("Edited lesson")},
            )

            authenticate(client, learner.id)
            official_list = client.get("/api/templates/official")
            public_list = client.get("/api/templates")
            learner_view = client.post(f"/api/templates/{seeded_id}/load")
            learner_view_created = client.get(f"/api/templates/{created.json()['id']}")

        assert created.status_code == 201
        assert created.json()["is_official"] is True
        # An Official template is always public, even though create defaults to private.
        assert created.json()["visibility"] == "public"
        assert created.json()["official_key"] is None
        assert created.json()["owner_id"] == teacher.id
        assert edited.status_code == 200
        assert edited.json()["name"] == "Instructor renamed"
        assert edited.json()["description"] == "Instructor description"
        assert edited.json()["workflow"]["nodes"][0]["data"]["label"] == "Instructor SIFT"
        assert edited.json()["visibility"] == "public"
        assert edited.json()["is_official"] is True
        assert cover.status_code == 200
        assert cover.json()["cover_url"].startswith("/static/test-instructor-official-covers/")
        assert edited_own_official.status_code == 200
        assert edited_own_official.json()["workflow"]["nodes"][0]["data"]["label"] == "Edited lesson"
        official_ids = [item["id"] for item in official_list.json()]
        assert created.json()["id"] in official_ids
        assert seeded_id in official_ids
        assert created.json()["id"] not in [item["id"] for item in public_list.json()]
        # The seed does not replace a workflow an instructor edited.
        assert learner_view.status_code == 200
        assert learner_view.json()["workflow"]["nodes"][0]["data"]["label"] == "Instructor SIFT"
        assert learner_view_created.status_code == 200

        with Session(engine) as db:
            create_log = db.scalar(select(AuditLog).where(
                AuditLog.action == "template.create",
                AuditLog.target_id == str(created.json()["id"]),
            ))
            update_log = db.scalar(select(AuditLog).where(
                AuditLog.action == "template.update",
                AuditLog.target_id == str(seeded_id),
            ))
            assert create_log.actor_id == teacher.id
            assert create_log.details == {"visibility": "public", "is_official": True}
            assert update_log.actor_id == teacher.id
            assert set(update_log.details["changes"]) == {"name", "description", "workflow"}
    finally:
        templates_router.TEMPLATE_COVERS_DIR = original_cover_dir
        shutil.rmtree(cover_dir, ignore_errors=True)
        app.dependency_overrides.clear()


def test_instructor_cannot_toggle_comments_but_admin_still_can():
    engine = make_engine()
    Base.metadata.create_all(engine)
    teacher = add_user(engine, "teacher", "teacher@example.com")
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    set_can_teach(engine, teacher.id)

    try:
        with make_client(engine) as client:
            authenticate(client, teacher.id)
            seeded_id = seeded_official_id(client)
            own_official = client.post(
                "/api/templates",
                json={"name": "Teacher official", "is_official": True, "workflow": workflow()},
            ).json()["id"]
            own_public = client.post(
                "/api/templates",
                json={"name": "Teacher public", "visibility": "public", "workflow": workflow()},
            ).json()["id"]
            teacher_seeded = client.patch(
                f"/api/admin/templates/{seeded_id}/comments",
                json={"comments_enabled": False},
            )
            teacher_own_official = client.patch(
                f"/api/admin/templates/{own_official}/comments",
                json={"comments_enabled": False},
            )
            teacher_own_public = client.patch(
                f"/api/admin/templates/{own_public}/comments",
                json={"comments_enabled": False},
            )

            authenticate(client, admin.id)
            admin_seeded = client.patch(
                f"/api/admin/templates/{seeded_id}/comments",
                json={"comments_enabled": False},
            )
            admin_teacher_public = client.patch(
                f"/api/admin/templates/{own_public}/comments",
                json={"comments_enabled": False},
            )

        assert teacher_seeded.status_code == 403
        assert teacher_own_official.status_code == 403
        # General templates keep the old rule: only an admin toggles comments.
        assert teacher_own_public.status_code == 403
        assert admin_seeded.status_code == 200
        assert admin_seeded.json()["comments_enabled"] is False
        assert admin_teacher_public.status_code == 200
        with Session(engine) as db:
            assert db.get(Template, own_official).comments_enabled is True
            logs = db.scalars(select(AuditLog).where(AuditLog.action == "permission.comments_update")).all()
            assert {log.actor_id for log in logs} == {admin.id}
    finally:
        app.dependency_overrides.clear()


def test_learner_cannot_create_or_edit_official_and_own_templates_still_work():
    engine = make_engine()
    Base.metadata.create_all(engine)
    learner = add_user(engine, "learner", "learner@example.com")
    cover_dir = os.path.join(OUT, "test-learner-official-covers")
    original_cover_dir = templates_router.TEMPLATE_COVERS_DIR
    templates_router.TEMPLATE_COVERS_DIR = cover_dir

    try:
        with make_client(engine) as client:
            authenticate(client, learner.id)
            seeded_id = seeded_official_id(client)
            count_before = template_count(engine)
            create_official = client.post(
                "/api/templates",
                json={"name": "Sneaky", "is_official": True, "visibility": "public", "workflow": workflow()},
            )
            count_after = template_count(engine)
            rename = client.patch(f"/api/templates/{seeded_id}", json={"name": "Hijacked"})
            change_workflow = client.patch(f"/api/templates/{seeded_id}", json={"workflow": workflow("Bad")})
            unmark = client.patch(f"/api/templates/{seeded_id}", json={"is_official": False})
            cover = client.post(
                f"/api/templates/{seeded_id}/cover",
                files={"file": ("cover.png", b"learner-cover", "image/png")},
            )
            comments = client.patch(
                f"/api/admin/templates/{seeded_id}/comments",
                json={"comments_enabled": False},
            )

            # The learner's own templates keep working as before.
            created = client.post(
                "/api/templates",
                json={"name": "Mine", "is_official": False, "workflow": workflow()},
            )
            own_id = created.json()["id"]
            promote_own = client.patch(f"/api/templates/{own_id}", json={"is_official": True})
            promote_own_with_name = client.patch(
                f"/api/templates/{own_id}",
                json={"name": "Renamed while promoting", "is_official": True},
            )
            edit_own = client.patch(
                f"/api/templates/{own_id}",
                json={"name": "Mine edited", "visibility": "public", "workflow": workflow("Mine v2")},
            )
            own_cover = client.post(
                f"/api/templates/{own_id}/cover",
                files={"file": ("cover.png", b"own-cover", "image/png")},
            )

        assert create_official.status_code == 403
        assert count_after == count_before
        assert rename.status_code == 403
        assert change_workflow.status_code == 403
        assert unmark.status_code == 403
        assert cover.status_code == 403
        assert comments.status_code == 403
        assert created.status_code == 201
        assert created.json()["is_official"] is False
        assert created.json()["visibility"] == "private"
        assert promote_own.status_code == 403
        assert promote_own_with_name.status_code == 403
        assert edit_own.status_code == 200
        assert edit_own.json()["name"] == "Mine edited"
        assert edit_own.json()["visibility"] == "public"
        assert edit_own.json()["is_official"] is False
        assert own_cover.status_code == 200

        with Session(engine) as db:
            seeded = db.get(Template, seeded_id)
            assert seeded.is_official is True
            assert seeded.name != "Hijacked"
            assert seeded.cover_url is None
            assert seeded.comments_enabled is True
            assert db.scalar(select(Template).where(Template.name == "Sneaky")) is None
            # The rejected promotions changed nothing, so nothing was logged for them.
            assert db.scalars(select(AuditLog).where(
                AuditLog.action == "permission.template_official_update"
            )).all() == []
            update_logs = db.scalars(select(AuditLog).where(
                AuditLog.action == "template.update",
                AuditLog.target_id == str(own_id),
            )).all()
            assert [set(log.details["changes"]) for log in update_logs] == [{"name", "workflow"}]
    finally:
        templates_router.TEMPLATE_COVERS_DIR = original_cover_dir
        shutil.rmtree(cover_dir, ignore_errors=True)
        app.dependency_overrides.clear()


def test_official_flag_rules_for_visibility_unmarking_and_payload_types():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    teacher = add_user(engine, "teacher", "teacher@example.com")
    set_can_teach(engine, teacher.id)

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            seeded_id = seeded_official_id(client)
            make_private = client.patch(f"/api/templates/{seeded_id}", json={"visibility": "private"})
            keep_public = client.patch(f"/api/templates/{seeded_id}", json={"visibility": "public"})
            unmark = client.patch(f"/api/templates/{seeded_id}", json={"is_official": False})
            already_official = client.patch(f"/api/templates/{seeded_id}", json={"is_official": True})
            empty_workflow = client.patch(
                f"/api/templates/{seeded_id}",
                json={"workflow": {"version": 1, "nodes": [], "edges": []}},
            )

            authenticate(client, teacher.id)
            private_official = client.post(
                "/api/templates",
                json={"name": "Private official", "is_official": True, "visibility": "private", "workflow": workflow()},
            )
            empty_official = client.post(
                "/api/templates",
                json={"name": "Empty official", "is_official": True,
                      "workflow": {"version": 1, "nodes": [], "edges": []}},
            )
            string_flag = client.post(
                "/api/templates",
                json={"name": "String flag", "is_official": "true", "workflow": workflow()},
            )
            null_flag = client.patch(f"/api/templates/{seeded_id}", json={"is_official": None})
            teacher_unmark = client.patch(f"/api/templates/{seeded_id}", json={"is_official": False})

        assert make_private.status_code == 403
        assert keep_public.status_code == 403
        assert unmark.status_code == 422
        assert already_official.status_code == 200
        assert already_official.json()["is_official"] is True
        # An emptied Official workflow would be silently refilled by the seed.
        assert empty_workflow.status_code == 422
        assert private_official.status_code == 422
        assert empty_official.status_code == 422
        assert string_flag.status_code == 422
        assert null_flag.status_code == 422
        assert teacher_unmark.status_code == 422

        with Session(engine) as db:
            seeded = db.get(Template, seeded_id)
            assert seeded.is_official is True
            assert seeded.visibility == "public"
            assert seeded.workflow["nodes"]
            assert db.scalar(select(Template).where(Template.name.in_(
                ["Private official", "Empty official", "String flag"]
            ))) is None
    finally:
        app.dependency_overrides.clear()


def test_marking_existing_template_official_is_limited_to_its_owner():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    teacher = add_user(engine, "teacher", "teacher@example.com")
    learner = add_user(engine, "learner", "learner@example.com")
    set_can_teach(engine, teacher.id)

    try:
        with make_client(engine) as client:
            authenticate(client, learner.id)
            learner_public = client.post(
                "/api/templates",
                json={"name": "Learner public", "visibility": "public", "workflow": workflow()},
            ).json()["id"]

            authenticate(client, teacher.id)
            teacher_private = client.post(
                "/api/templates",
                json={"name": "Teacher draft", "visibility": "private", "workflow": workflow()},
            ).json()["id"]
            teacher_marks_other = client.patch(f"/api/templates/{learner_public}", json={"is_official": True})
            promoted = client.patch(f"/api/templates/{teacher_private}", json={"is_official": True})
            private_promotion = client.post(
                "/api/templates",
                json={"name": "Teacher draft 2", "visibility": "private", "workflow": workflow()},
            ).json()["id"]
            promote_but_private = client.patch(
                f"/api/templates/{private_promotion}",
                json={"is_official": True, "visibility": "private"},
            )

            authenticate(client, admin.id)
            admin_marks_other = client.patch(f"/api/templates/{learner_public}", json={"is_official": True})
            admin_own = client.post(
                "/api/templates",
                json={"name": "Admin public", "visibility": "public", "workflow": workflow()},
            ).json()["id"]
            admin_promoted = client.patch(f"/api/templates/{admin_own}", json={"is_official": True})

        assert teacher_marks_other.status_code == 403
        assert admin_marks_other.status_code == 403
        assert promoted.status_code == 200
        assert promoted.json()["is_official"] is True
        assert promoted.json()["visibility"] == "public"
        assert promoted.json()["official_key"] is None
        assert promote_but_private.status_code == 422
        assert admin_promoted.status_code == 200
        assert admin_promoted.json()["is_official"] is True

        with Session(engine) as db:
            assert db.get(Template, learner_public).is_official is False
            assert db.get(Template, private_promotion).is_official is False
            assert db.get(Template, private_promotion).visibility == "private"
            official_log = db.scalar(select(AuditLog).where(
                AuditLog.action == "permission.template_official_update",
                AuditLog.target_id == str(teacher_private),
            ))
            visibility_log = db.scalar(select(AuditLog).where(
                AuditLog.action == "permission.template_visibility_update",
                AuditLog.target_id == str(teacher_private),
            ))
            assert official_log.actor_id == teacher.id
            assert official_log.details == {"is_official": {"from": False, "to": True}}
            assert visibility_log.details == {"visibility": {"from": "private", "to": "public"}}
    finally:
        app.dependency_overrides.clear()


def test_revoked_or_banned_instructor_loses_official_rights_immediately():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    teacher = add_user(engine, "teacher", "teacher@example.com")
    set_can_teach(engine, teacher.id)

    try:
        with make_client(engine) as client:
            authenticate(client, teacher.id)
            seeded_id = seeded_official_id(client)
            before = client.patch(f"/api/templates/{seeded_id}", json={"name": "While teaching"})

            authenticate(client, admin.id)
            client.patch(f"/api/admin/users/{teacher.id}", json={"can_teach": False})

            # Same session cookie: permissions are read from the database on every request.
            authenticate(client, teacher.id)
            after_revoke = client.patch(f"/api/templates/{seeded_id}", json={"name": "After revoke"})
            create_after_revoke = client.post(
                "/api/templates",
                json={"name": "Late official", "is_official": True, "workflow": workflow()},
            )

            authenticate(client, admin.id)
            client.patch(f"/api/admin/users/{teacher.id}", json={"can_teach": True})
            client.patch(
                f"/api/admin/users/{teacher.id}",
                json={"status": "banned", "banned_until": "2099-01-01T00:00:00+00:00"},
            )

            authenticate(client, teacher.id)
            while_banned = client.patch(f"/api/templates/{seeded_id}", json={"name": "While banned"})

        assert before.status_code == 200
        assert after_revoke.status_code == 403
        assert create_after_revoke.status_code == 403
        assert while_banned.status_code == 403
        assert while_banned.json()["detail"] == "Account is banned"
        with Session(engine) as db:
            assert db.get(Template, seeded_id).name == "While teaching"
    finally:
        app.dependency_overrides.clear()
