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
from server.models import AuditLog, Comment, Template, User
from server.official_templates import OFFICIAL_TEMPLATE_CATALOG, ensure_official_template_records
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


def image_bytes(fmt: str, mode: str = "RGB", size=(8, 6)) -> bytes:
    from io import BytesIO

    from PIL import Image

    buffer = BytesIO()
    Image.new(mode, size, 128 if mode == "L" else (200, 30, 60)).save(buffer, format=fmt)
    return buffer.getvalue()


def png_bytes() -> bytes:
    # ปกที่ server รับต้องเป็นภาพจริง (B1 ตรวจจากเนื้อหาและ re-encode)
    return image_bytes("PNG")


def image_format(contents: bytes):
    from io import BytesIO

    from PIL import Image

    with Image.open(BytesIO(contents)) as image:
        return image.format


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
        # B4 (21 พ.ย. 2569): PATCH บน Private ของคนอื่นตอบ 404 เหมือน GET/DELETE เพื่อไม่ให้ไล่หา id ได้ (เดิม 403)
        assert forbidden_update.status_code == 404
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
                files={"file": ("cover.png", png_bytes(), "image/png")},
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
        # B1: ปกถูก re-encode โดย server จึงเทียบว่าเป็น PNG ที่เปิดได้ ไม่เทียบไบต์ตรงกับที่ส่ง
        assert image_format(served_cover.content) == "PNG"
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
                files={"file": ("cover.png", png_bytes(), "image/png")},
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
                files={"file": ("cover.png", png_bytes(), "image/png")},
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
                files={"file": ("cover.png", png_bytes(), "image/png")},
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


# ---------------------------------------------------------------------------
# T8.1: soft delete (DELETE /api/templates/{id}, templates.deleted_at)
# ---------------------------------------------------------------------------


def delete_logs(engine) -> list[AuditLog]:
    with Session(engine) as db:
        logs = db.scalars(
            select(AuditLog).where(AuditLog.action == "template.delete").order_by(AuditLog.id)
        ).all()
        for log in logs:
            db.expunge(log)
        return logs


def test_admin_and_instructor_delete_official_and_learner_cannot():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    teacher = add_user(engine, "teacher", "teacher@example.com")
    revoked = add_user(engine, "revoked", "revoked@example.com")
    learner = add_user(engine, "learner", "learner@example.com")
    set_can_teach(engine, teacher.id)

    try:
        with make_client(engine) as client:
            authenticate(client, learner.id)
            official = client.get("/api/templates/official").json()
            first_id, second_id, third_id = (item["id"] for item in official[:3])
            learner_delete = client.delete(f"/api/templates/{first_id}")

            # can_teach was never granted (or was revoked): same as a learner.
            authenticate(client, revoked.id)
            revoked_delete = client.delete(f"/api/templates/{first_id}")

            authenticate(client, teacher.id)
            teacher_delete = client.delete(f"/api/templates/{first_id}")
            teacher_again = client.delete(f"/api/templates/{first_id}")

            authenticate(client, admin.id)
            admin_delete = client.delete(f"/api/templates/{second_id}")
            admin_again = client.delete(f"/api/templates/{first_id}")

            authenticate(client, learner.id)
            official_after = client.get("/api/templates/official")

        assert learner_delete.status_code == 403
        assert revoked_delete.status_code == 403
        assert teacher_delete.status_code == 204
        assert teacher_delete.content == b""
        assert teacher_again.status_code == 404
        assert admin_delete.status_code == 204
        assert admin_again.status_code == 404
        remaining = [item["id"] for item in official_after.json()]
        assert first_id not in remaining
        assert second_id not in remaining
        assert third_id in remaining
        assert len(remaining) == len(OFFICIAL_TEMPLATE_CATALOG) - 2

        with Session(engine) as db:
            # Soft delete: the rows and their data stay in the database.
            first = db.get(Template, first_id)
            second = db.get(Template, second_id)
            assert first.deleted_at is not None
            assert second.deleted_at is not None
            assert first.is_official is True
            assert first.official_key
            assert db.get(Template, third_id).deleted_at is None

        logs = delete_logs(engine)
        assert [(log.actor_id, log.target_id) for log in logs] == [
            (teacher.id, str(first_id)),
            (admin.id, str(second_id)),
        ]
        assert logs[0].target_type == "template"
        assert logs[0].status_code == 204
        assert logs[0].details["is_official"] is True
        assert logs[0].details["name"] == official[0]["name"]
        assert logs[0].details["official_key"] == official[0]["official_key"]
        assert logs[0].details["deleted_by"] == {"id": teacher.id, "display_name": "teacher"}
        assert logs[1].details["deleted_by"] == {"id": admin.id, "display_name": "admin"}
    finally:
        app.dependency_overrides.clear()


def test_owner_deletes_own_templates_and_nobody_else_can():
    engine = make_engine()
    Base.metadata.create_all(engine)
    owner = add_user(engine, "owner", "owner@example.com")
    other = add_user(engine, "other", "other@example.com")
    teacher = add_user(engine, "teacher", "teacher@example.com")
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    set_can_teach(engine, teacher.id)

    try:
        with make_client(engine) as client:
            anonymous = client.delete("/api/templates/1")

            authenticate(client, owner.id)
            public_id = client.post(
                "/api/templates",
                json={"name": "Owner public", "visibility": "public", "workflow": workflow()},
            ).json()["id"]
            private_id = client.post(
                "/api/templates",
                json={"name": "Owner private", "visibility": "private", "workflow": workflow()},
            ).json()["id"]

            authenticate(client, other.id)
            other_public = client.delete(f"/api/templates/{public_id}")
            other_private = client.delete(f"/api/templates/{private_id}")
            missing = client.delete("/api/templates/9999")

            authenticate(client, teacher.id)
            teacher_public = client.delete(f"/api/templates/{public_id}")
            teacher_private = client.delete(f"/api/templates/{private_id}")

            authenticate(client, admin.id)
            admin_public = client.delete(f"/api/templates/{public_id}")
            admin_private = client.delete(f"/api/templates/{private_id}")

            authenticate(client, owner.id)
            owner_public = client.delete(f"/api/templates/{public_id}")
            owner_private = client.delete(f"/api/templates/{private_id}")
            mine_after = client.get("/api/templates/mine")

        assert anonymous.status_code == 401
        assert other_public.status_code == 403
        # Someone else's private template stays hidden, exactly like opening it.
        assert other_private.status_code == 404
        assert missing.status_code == 404
        assert teacher_public.status_code == 403
        assert teacher_private.status_code == 404
        # Admins delete Official templates, not other people's templates.
        assert admin_public.status_code == 403
        assert admin_private.status_code == 403
        assert owner_public.status_code == 204
        assert owner_private.status_code == 204
        assert mine_after.json() == []

        logs = delete_logs(engine)
        assert [(log.actor_id, log.target_id, log.details["is_official"], log.details["visibility"])
                for log in logs] == [
            (owner.id, str(public_id), False, "public"),
            (owner.id, str(private_id), False, "private"),
        ]
        assert logs[0].details["name"] == "Owner public"
        assert logs[0].details["owner_id"] == owner.id
    finally:
        app.dependency_overrides.clear()


def test_learner_who_owns_an_official_template_cannot_delete_it_after_can_teach_is_revoked():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    teacher = add_user(engine, "teacher", "teacher@example.com")
    set_can_teach(engine, teacher.id)

    try:
        with make_client(engine) as client:
            authenticate(client, teacher.id)
            official_id = client.post(
                "/api/templates",
                json={"name": "Lesson", "is_official": True, "workflow": workflow()},
            ).json()["id"]

            authenticate(client, admin.id)
            client.patch(f"/api/admin/users/{teacher.id}", json={"can_teach": False})

            authenticate(client, teacher.id)
            owner_delete = client.delete(f"/api/templates/{official_id}")

            authenticate(client, admin.id)
            client.patch(f"/api/admin/users/{teacher.id}", json={"can_teach": True})
            client.patch(
                f"/api/admin/users/{teacher.id}",
                json={"status": "banned", "banned_until": "2099-01-01T00:00:00+00:00"},
            )
            authenticate(client, teacher.id)
            banned_delete = client.delete(f"/api/templates/{official_id}")

        assert owner_delete.status_code == 403
        assert banned_delete.status_code == 403
        with Session(engine) as db:
            assert db.get(Template, official_id).deleted_at is None
        assert delete_logs(engine) == []
    finally:
        app.dependency_overrides.clear()


def test_deleted_templates_are_hidden_from_every_list_and_endpoint():
    engine = make_engine()
    Base.metadata.create_all(engine)
    owner = add_user(engine, "owner", "owner@example.com")
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    cover_dir = os.path.join(OUT, "test-deleted-template-covers")
    original_cover_dir = templates_router.TEMPLATE_COVERS_DIR
    templates_router.TEMPLATE_COVERS_DIR = cover_dir

    try:
        with make_client(engine) as client:
            authenticate(client, owner.id)
            public_id = client.post(
                "/api/templates",
                json={"name": "Public", "visibility": "public", "workflow": workflow()},
            ).json()["id"]
            private_id = client.post(
                "/api/templates",
                json={"name": "Private", "visibility": "private", "workflow": workflow()},
            ).json()["id"]
            kept_id = client.post(
                "/api/templates",
                json={"name": "Kept", "visibility": "public", "workflow": workflow()},
            ).json()["id"]
            comment_id = client.post(
                f"/api/templates/{public_id}/comments",
                json={"body": "Before delete"},
            ).json()["id"]
            official_id = seeded_official_id(client)
            official_comment_id = client.post(
                f"/api/templates/{official_id}/comments",
                json={"body": "On official"},
            ).json()["id"]
            assert client.delete(f"/api/templates/{public_id}").status_code == 204
            assert client.delete(f"/api/templates/{private_id}").status_code == 204

            authenticate(client, admin.id)
            assert client.delete(f"/api/templates/{official_id}").status_code == 204
            admin_toggle = client.patch(
                f"/api/admin/templates/{official_id}/comments",
                json={"comments_enabled": False},
            )
            admin_get_private = client.get(f"/api/templates/{private_id}")

            authenticate(client, owner.id)
            public_list = client.get("/api/templates")
            official_list = client.get("/api/templates/official")
            mine = client.get("/api/templates/mine")
            responses = {}
            for template_id in (public_id, private_id, official_id):
                responses[template_id] = [
                    client.get(f"/api/templates/{template_id}"),
                    client.post(f"/api/templates/{template_id}/load"),
                    client.get(f"/api/templates/{template_id}/comments"),
                    client.post(f"/api/templates/{template_id}/comments", json={"body": "After delete"}),
                    client.patch(f"/api/templates/{template_id}", json={"name": "Revived"}),
                    client.patch(f"/api/templates/{template_id}", json={"visibility": "public"}),
                    client.post(
                        f"/api/templates/{template_id}/cover",
                        files={"file": ("cover.png", b"cover", "image/png")},
                    ),
                    client.delete(f"/api/templates/{template_id}"),
                ]
            delete_comment = client.delete(f"/api/templates/{public_id}/comments/{comment_id}")
            delete_official_comment = client.delete(
                f"/api/templates/{official_id}/comments/{official_comment_id}"
            )

        assert [item["id"] for item in public_list.json()] == [kept_id]
        assert official_id not in [item["id"] for item in official_list.json()]
        assert [item["id"] for item in mine.json()] == [kept_id]
        assert admin_toggle.status_code == 404
        assert admin_get_private.status_code == 404
        for template_id, results in responses.items():
            assert [response.status_code for response in results] == [404] * len(results), template_id
        assert delete_comment.status_code == 404
        assert delete_official_comment.status_code == 404

        with Session(engine) as db:
            for template_id in (public_id, private_id, official_id):
                saved = db.get(Template, template_id)
                assert saved.deleted_at is not None
                assert saved.name != "Revived"
                assert saved.cover_url is None
            assert db.get(Template, official_id).comments_enabled is True
            # Soft delete keeps the comments; they are only unreachable.
            assert db.get(Comment, comment_id) is not None
            assert db.get(Comment, official_comment_id) is not None
            assert db.scalar(select(Comment).where(Comment.body == "After delete")) is None
        assert len(delete_logs(engine)) == 3
    finally:
        templates_router.TEMPLATE_COVERS_DIR = original_cover_dir
        shutil.rmtree(cover_dir, ignore_errors=True)
        app.dependency_overrides.clear()


def test_seed_does_not_recreate_deleted_official_or_refill_its_workflow():
    engine = make_engine()
    Base.metadata.create_all(engine)
    admin = add_user(engine, "admin", "admin@example.com", role="admin")

    with Session(engine) as db:
        ensure_official_template_records(db)
        rows = db.scalars(select(Template).where(Template.is_official.is_(True)).order_by(Template.id)).all()
        deleted_id, emptied_deleted_id, emptied_kept_id = rows[0].id, rows[1].id, rows[2].id
        deleted_key = rows[0].official_key
        # Rows from before workflows lived in the database have an empty workflow.
        rows[1].workflow = {"version": 1, "nodes": [], "edges": []}
        rows[2].workflow = {"version": 1, "nodes": [], "edges": []}
        db.commit()

    try:
        with make_client(engine) as client:
            authenticate(client, admin.id)
            assert client.delete(f"/api/templates/{deleted_id}").status_code == 204
            assert client.delete(f"/api/templates/{emptied_deleted_id}").status_code == 204
            official_after = client.get("/api/templates/official")

        with Session(engine) as db:
            ensure_official_template_records(db)
            ensure_official_template_records(db)

        with Session(engine) as db:
            official_rows = db.scalars(select(Template).where(Template.is_official.is_(True))).all()
            assert len(official_rows) == len(OFFICIAL_TEMPLATE_CATALOG)
            assert [row.id for row in official_rows if row.official_key == deleted_key] == [deleted_id]
            assert db.get(Template, deleted_id).deleted_at is not None
            emptied_deleted = db.get(Template, emptied_deleted_id)
            assert emptied_deleted.deleted_at is not None
            assert emptied_deleted.workflow["nodes"] == []
            # A row that is not deleted still receives the seeded workflow, as before.
            assert db.get(Template, emptied_kept_id).workflow["nodes"]
            assert len(db.scalars(select(User).where(User.provider == "system")).all()) == 1

        assert official_after.status_code == 200
        listed = {item["id"] for item in official_after.json()}
        assert deleted_id not in listed
        assert emptied_deleted_id not in listed
        assert len(listed) == len(OFFICIAL_TEMPLATE_CATALOG) - 2
    finally:
        app.dependency_overrides.clear()


# ---- หลังจุดตรวจ 2 -------------------------------------------------------

def _private_template(client, owner_id: int, name: str = "Private") -> int:
    authenticate(client, owner_id)
    created = client.post(
        "/api/templates",
        json={"name": name, "visibility": "private", "workflow": workflow()},
    )
    assert created.status_code == 201
    return created.json()["id"]


def test_b1_cover_rejects_non_images_and_stores_a_reencoded_image_with_a_server_extension():
    engine = make_engine()
    Base.metadata.create_all(engine)
    owner = add_user(engine, "owner", "owner@example.com")
    cover_dir = os.path.join(OUT, "test-b1-covers")
    original_cover_dir = templates_router.TEMPLATE_COVERS_DIR
    templates_router.TEMPLATE_COVERS_DIR = cover_dir
    payload = b"<script>alert(document.cookie)</script>"
    png_with_trailer = png_bytes() + b"<html><script>alert(1)</script></html>"

    try:
        with make_client(engine) as client:
            template_id = _private_template(client, owner.id)
            rejected = [
                client.post(f"/api/templates/{template_id}/cover", files={"file": (name, body, kind)})
                for name, body, kind in (
                    ("evil.html", b"<html>" + payload + b"</html>", "image/png"),
                    ("evil.png", b"<svg xmlns='http://www.w3.org/2000/svg'>" + payload + b"</svg>", "image/png"),
                    ("notes.jpg", b"just some text", "image/jpeg"),
                    ("cover.gif", image_bytes("GIF"), "image/png"),
                )
            ]
            files_after_rejects = os.listdir(cover_dir) if os.path.isdir(cover_dir) else []
            accepted = {}
            for fmt, mime, name in (
                ("JPEG", "image/jpeg", "photo.html"),
                ("PNG", "image/png", "cover.exe"),
                ("WEBP", "image/webp", "cover"),
            ):
                response = client.post(
                    f"/api/templates/{template_id}/cover",
                    files={"file": (name, image_bytes(fmt), mime)},
                )
                served = client.get(response.json()["cover_url"])
                accepted[fmt] = (response, served)
            trailer = client.post(
                f"/api/templates/{template_id}/cover",
                files={"file": ("cover.png", png_with_trailer, "image/png")},
            )
            trailer_served = client.get(trailer.json()["cover_url"])

        assert [response.status_code for response in rejected] == [422, 422, 422, 422]
        assert files_after_rejects == []
        for fmt, ext in (("JPEG", ".jpg"), ("PNG", ".png"), ("WEBP", ".webp")):
            response, served = accepted[fmt]
            assert response.status_code == 200, fmt
            url = response.json()["cover_url"]
            assert url.endswith(ext), url
            assert "photo" not in url and "cover.exe" not in url
            assert served.status_code == 200
            assert served.headers["x-content-type-options"] == "nosniff"
            assert image_format(served.content) == fmt
        assert trailer.status_code == 200
        assert b"<script>" not in trailer_served.content
        assert image_format(trailer_served.content) == "PNG"
    finally:
        templates_router.TEMPLATE_COVERS_DIR = original_cover_dir
        shutil.rmtree(cover_dir, ignore_errors=True)
        app.dependency_overrides.clear()


def test_static_files_are_served_with_nosniff():
    probe_dir = os.path.join(OUT, "test-nosniff")
    os.makedirs(probe_dir, exist_ok=True)
    with open(os.path.join(probe_dir, "existing.png"), "wb") as handle:
        handle.write(png_bytes())
    try:
        with TestClient(app) as client:
            served = client.get("/static/test-nosniff/existing.png")
        assert served.status_code == 200
        assert served.headers["x-content-type-options"] == "nosniff"
    finally:
        shutil.rmtree(probe_dir, ignore_errors=True)


def test_b3_admin_reads_someone_elses_private_template_but_cannot_comment_or_toggle_comments():
    engine = make_engine()
    Base.metadata.create_all(engine)
    owner = add_user(engine, "owner", "owner@example.com")
    admin = add_user(engine, "admin", "admin@example.com", role="admin")

    try:
        with make_client(engine) as client:
            private_id = _private_template(client, owner.id)
            public = client.post(
                "/api/templates",
                json={"name": "Public", "visibility": "public", "workflow": workflow()},
            ).json()["id"]
            owner_comment = client.post(f"/api/templates/{private_id}/comments", json={"body": "note to self"})

            authenticate(client, admin.id)
            own_private = client.post(
                "/api/templates",
                json={"name": "Admin private", "visibility": "private", "workflow": workflow()},
            ).json()["id"]
            detail = client.get(f"/api/templates/{private_id}")
            loaded = client.post(f"/api/templates/{private_id}/load")
            comments = client.get(f"/api/templates/{private_id}/comments")
            comment = client.post(f"/api/templates/{private_id}/comments", json={"body": "admin note"})
            toggle = client.patch(f"/api/admin/templates/{private_id}/comments", json={"comments_enabled": False})
            public_toggle = client.patch(f"/api/admin/templates/{public}/comments", json={"comments_enabled": False})
            public_comment_toggle_back = client.patch(
                f"/api/admin/templates/{public}/comments", json={"comments_enabled": True}
            )
            public_comment = client.post(f"/api/templates/{public}/comments", json={"body": "admin on public"})
            own_private_toggle = client.patch(
                f"/api/admin/templates/{own_private}/comments", json={"comments_enabled": False}
            )

        assert owner_comment.status_code == 201
        assert detail.status_code == 200
        assert loaded.status_code == 200
        assert comments.status_code == 200
        assert comment.status_code == 403
        assert toggle.status_code == 403
        assert public_toggle.status_code == 200
        assert public_comment_toggle_back.status_code == 200
        assert public_comment.status_code == 201
        assert own_private_toggle.status_code == 200
        with Session(engine) as db:
            saved = db.get(Template, private_id)
            assert saved.comments_enabled is True
            bodies = db.scalars(select(Comment.body).where(Comment.template_id == private_id)).all()
            assert bodies == ["note to self"]
    finally:
        app.dependency_overrides.clear()


def test_b4_patch_and_cover_on_someone_elses_private_template_are_404_for_those_who_cannot_see_it():
    engine = make_engine()
    Base.metadata.create_all(engine)
    owner = add_user(engine, "owner", "owner@example.com")
    viewer = add_user(engine, "viewer", "viewer@example.com")
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    cover_dir = os.path.join(OUT, "test-b4-covers")
    original_cover_dir = templates_router.TEMPLATE_COVERS_DIR
    templates_router.TEMPLATE_COVERS_DIR = cover_dir

    try:
        with make_client(engine) as client:
            private_id = _private_template(client, owner.id)
            public_id = client.post(
                "/api/templates",
                json={"name": "Public", "visibility": "public", "workflow": workflow()},
            ).json()["id"]

            authenticate(client, viewer.id)
            viewer_patch = client.patch(f"/api/templates/{private_id}", json={"name": "x"})
            viewer_cover = client.post(
                f"/api/templates/{private_id}/cover", files={"file": ("c.png", png_bytes(), "image/png")}
            )
            viewer_public_patch = client.patch(f"/api/templates/{public_id}", json={"name": "x"})
            viewer_public_cover = client.post(
                f"/api/templates/{public_id}/cover", files={"file": ("c.png", png_bytes(), "image/png")}
            )
            missing_patch = client.patch("/api/templates/999999", json={"name": "x"})

            authenticate(client, admin.id)
            admin_patch = client.patch(f"/api/templates/{private_id}", json={"name": "x"})
            admin_cover = client.post(
                f"/api/templates/{private_id}/cover", files={"file": ("c.png", png_bytes(), "image/png")}
            )

        assert viewer_patch.status_code == 404
        assert viewer_cover.status_code == 404
        assert viewer_public_patch.status_code == 403
        assert viewer_public_cover.status_code == 403
        assert missing_patch.status_code == 404
        assert admin_patch.status_code == 403
        assert admin_cover.status_code == 403
        with Session(engine) as db:
            assert db.get(Template, private_id).name == "Private"
            assert db.get(Template, private_id).cover_url is None
    finally:
        templates_router.TEMPLATE_COVERS_DIR = original_cover_dir
        shutil.rmtree(cover_dir, ignore_errors=True)
        app.dependency_overrides.clear()


def test_a5a_admin_and_instructor_lists_never_include_someone_elses_private_template():
    engine = make_engine()
    Base.metadata.create_all(engine)
    learner = add_user(engine, "learner", "learner@example.com")
    admin = add_user(engine, "admin", "admin@example.com", role="admin")
    teacher = add_user(engine, "teacher", "teacher@example.com")
    with Session(engine) as db:
        db.get(User, teacher.id).can_teach = True
        db.commit()

    try:
        with make_client(engine) as client:
            private_id = _private_template(client, learner.id, "Learner private")
            listings = {}
            for name, user in (("admin", admin), ("teacher", teacher)):
                authenticate(client, user.id)
                listings[name] = [
                    [item["id"] for item in client.get(path).json()]
                    for path in ("/api/templates", "/api/templates/official", "/api/templates/mine")
                ]
            teacher_detail = client.get(f"/api/templates/{private_id}")
            teacher_load = client.post(f"/api/templates/{private_id}/load")

        for name, lists in listings.items():
            for ids in lists:
                assert private_id not in ids, name
        assert teacher_detail.status_code == 404
        assert teacher_load.status_code == 404
    finally:
        app.dependency_overrides.clear()
