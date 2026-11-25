import os

os.environ["AUTO_CREATE_TABLES"] = "false"

import re

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from server.auth import utc_now
from server.database import Base
from server.main import app
from server.models import AuditLog, Course, User
from server.routers import courses as courses_router
from test_templates_api import add_user, authenticate, make_client, make_engine


CODE_PATTERN = r"^VP-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$"


def set_user(engine, user_id: int, **values) -> None:
    with Session(engine) as db:
        user = db.get(User, user_id)
        for key, value in values.items():
            setattr(user, key, value)
        db.commit()


def set_course(engine, course_id: int, **values) -> None:
    with Session(engine) as db:
        course = db.get(Course, course_id)
        for key, value in values.items():
            setattr(course, key, value)
        db.commit()


def body(**overrides) -> dict:
    return {"title": "Image Processing", "description": "Basics", **overrides}


@pytest.fixture
def env():
    engine = make_engine()
    Base.metadata.create_all(engine)
    users = {
        "admin": add_user(engine, "c-admin", "admin@example.com", role="admin"),
        "a": add_user(engine, "c-a", "teacher-a@example.com"),
        "b": add_user(engine, "c-b", "teacher-b@example.com"),
        "learner": add_user(engine, "c-learner", "learner@example.com"),
    }
    for key in ("a", "b"):
        set_user(engine, users[key].id, can_teach=True)
    try:
        with make_client(engine) as client:

            def login(key: str | None):
                client.cookies.clear()
                if key is not None:
                    authenticate(client, users[key].id)
                    assert client.get("/api/auth/me").json()["id"] == users[key].id
                return client

            yield engine, users, login
    finally:
        app.dependency_overrides.clear()


def create(login, who: str = "a", **overrides):
    return login(who).post("/api/courses", json=body(**overrides))


def test_user_without_can_teach_cannot_list_managed_or_create(env):
    _, _, login = env
    assert login("learner").get("/api/courses/managed").status_code == 403
    assert create(login, "learner").status_code == 403
    assert login(None).get("/api/courses/managed").status_code == 401
    assert login(None).post("/api/courses", json=body()).status_code == 401


def test_teacher_creates_draft(env):
    _, users, login = env
    response = create(login, title="  Filters  ", description="  d  ")
    assert response.status_code == 201
    course = response.json()
    assert course["status"] == "draft"
    assert (course["title"], course["description"]) == ("Filters", "d")
    assert (course["owner_id"], course["owner_name"]) == (users["a"].id, "teacher-a")
    assert (course["lesson_count"], course["enrolled_count"], course["enrolled"]) == (0, 0, False)
    assert course["can_manage"] is True


def test_draft_is_visible_to_managers_only(env):
    _, _, login = env
    course_id = create(login).json()["id"]
    for who in ("learner", "b", None):
        assert login(who).get(f"/api/courses/{course_id}").status_code == 404
    for who in ("a", "admin"):
        response = login(who).get(f"/api/courses/{course_id}")
        assert response.status_code == 200
        assert response.json()["can_manage"] is True


def test_public_list_has_published_only(env):
    engine, _, login = env
    draft = create(login).json()["id"]
    published = create(login).json()["id"]
    set_course(engine, published, status="published")
    for who in (None, "a", "admin", "learner"):
        page = login(who).get("/api/courses").json()
        assert page["next"] is None
        assert [item["id"] for item in page["items"]] == [published]
    assert draft != published
    visitor = login(None).get(f"/api/courses/{published}")
    assert visitor.status_code == 200
    assert visitor.json()["can_manage"] is False


def test_managed_list_is_own_courses_or_all_for_admin(env):
    _, _, login = env
    a_course = create(login, "a").json()["id"]
    b_course = create(login, "b").json()["id"]
    ids = lambda who: {item["id"] for item in login(who).get("/api/courses/managed").json()["items"]}
    assert ids("a") == {a_course}
    assert ids("b") == {b_course}
    assert ids("admin") == {a_course, b_course}


def test_patch_permissions(env):
    engine, _, login = env
    course_id = create(login).json()["id"]
    url = f"/api/courses/{course_id}"
    assert login("b").patch(url, json={"title": "x"}).status_code == 404
    edited = login("admin").patch(url, json={"title": "By admin"})
    assert edited.status_code == 200
    assert edited.json()["title"] == "By admin"
    set_course(engine, course_id, status="published")
    assert login("b").patch(url, json={"title": "x"}).status_code == 403


def test_revoked_can_teach_stops_management_at_once(env):
    engine, users, login = env
    draft = create(login).json()["id"]
    published = create(login).json()["id"]
    set_course(engine, published, status="published")
    set_user(engine, users["a"].id, can_teach=False)

    # A published course stays visible, so the answer is 403; a draft is hidden, so 404.
    assert login("a").patch(f"/api/courses/{published}", json={"title": "x"}).status_code == 403
    assert login("a").patch(f"/api/courses/{draft}", json={"title": "x"}).status_code == 404
    assert login("a").get("/api/courses/managed").status_code == 403


def test_blank_code_is_generated(env):
    _, _, login = env
    for overrides in ({}, {"code": ""}, {"code": "   "}, {"code": None}):
        assert re.match(CODE_PATTERN, create(login, **overrides).json()["code"])


def test_code_is_upper_cased_and_unique(env):
    _, _, login = env
    first = create(login, code=" img-101 ")
    assert first.json()["code"] == "IMG-101"
    duplicate = create(login, "b", code="IMG-101")
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Course code already in use"
    other = create(login, code="IMG-102").json()["id"]
    assert login("a").patch(f"/api/courses/{other}", json={"code": "img-101"}).status_code == 409
    # Saving a course with its own code, or a blank one, keeps the code.
    for code in ("img-102", ""):
        same = login("a").patch(f"/api/courses/{other}", json={"code": code})
        assert (same.status_code, same.json()["code"]) == (200, "IMG-102")


def test_code_race_at_insert_is_409(env, monkeypatch):
    _, _, login = env
    other = create(login, code="IMG-102").json()["id"]
    create(login, code="IMG-101")
    # Both requests passed the pre-check: only the unique index is left to stop them.
    monkeypatch.setattr(courses_router, "_code_in_use", lambda *args, **kwargs: False)
    assert create(login, code="IMG-101").status_code == 409
    assert login("a").patch(f"/api/courses/{other}", json={"code": "IMG-101"}).status_code == 409


def test_generated_code_retries_then_gives_up(env, monkeypatch):
    _, _, login = env
    create(login, code="VP-AAAAAA")
    letters = iter("A" * 6 + "B" * 6)
    monkeypatch.setattr(courses_router.secrets, "choice", lambda _: next(letters))
    assert create(login).json()["code"] == "VP-BBBBBB"
    monkeypatch.setattr(courses_router.secrets, "choice", lambda _: "A")
    assert create(login).status_code == 500


@pytest.mark.parametrize(
    "overrides",
    [
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 121},
        {"description": "  "},
        {"description": "x" * 1001},
        {"code": "x" * 21},
        {"status": "published"},
        {"owner_id": 1},
    ],
)
def test_invalid_input_is_422_on_create_and_patch(env, overrides):
    _, _, login = env
    course_id = create(login).json()["id"]
    assert create(login, **overrides).status_code == 422
    assert login("a").patch(f"/api/courses/{course_id}", json=overrides).status_code == 422


def test_patch_rejects_null_title_and_description(env):
    _, _, login = env
    course_id = create(login).json()["id"]
    for field in ("title", "description"):
        assert login("a").patch(f"/api/courses/{course_id}", json={field: None}).status_code == 422


def test_create_and_update_are_audited(env):
    engine, users, login = env
    course = create(login).json()
    login("a").patch(f"/api/courses/{course['id']}", json={"title": "New", "description": "Basics"})
    login("a").patch(f"/api/courses/{course['id']}", json={"title": "New"})  # no change, no row
    with Session(engine) as db:
        rows = db.scalars(select(AuditLog).where(AuditLog.target_type == "course").order_by(AuditLog.id)).all()
        assert [(row.action, row.actor_id, row.target_id, row.status_code) for row in rows] == [
            ("course.create", users["a"].id, str(course["id"]), 201),
            ("course.update", users["a"].id, str(course["id"]), 200),
        ]
        assert rows[0].details == {"code": course["code"], "status": "draft"}
        assert rows[1].details == {"fields": ["title"]}


def test_partial_unique_index_ignores_deleted_courses(env):
    engine, users, login = env
    course_id = create(login, code="IMG-101").json()["id"]
    set_course(engine, course_id, deleted_at=utc_now())
    assert login("admin").get(f"/api/courses/{course_id}").status_code == 404
    assert login("admin").get("/api/courses/managed").json()["items"] == []
    assert create(login, code="IMG-101").status_code == 201
    with Session(engine) as db:
        db.add(Course(owner_id=users["a"].id, code="IMG-101", title="t", description="d"))
        with pytest.raises(IntegrityError):
            db.commit()
