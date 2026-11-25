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
from server.models import AuditLog, Course, Lesson, User
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


def add_lesson(login, course_id: int, who: str = "a") -> dict:
    response = login(who).post(f"/api/courses/{course_id}/lessons")
    assert response.status_code == 201
    return response.json()


def lesson_rows(login, course_id: int, who: str | None = "a") -> list[dict]:
    return login(who).get(f"/api/courses/{course_id}/lessons").json()


def lesson_requests(client, course_id: int, lesson_id: int) -> list:
    return [
        client.post(f"/api/courses/{course_id}/lessons"),
        client.patch(f"/api/lessons/{lesson_id}", json={"title": "x"}),
        client.delete(f"/api/lessons/{lesson_id}"),
        client.post(f"/api/lessons/{lesson_id}/move", json={"direction": 1}),
    ]


def test_new_lesson_defaults(env):
    _, _, login = env
    course_id = create(login).json()["id"]
    add_lesson(login, course_id)
    lesson = add_lesson(login, course_id, "admin")
    assert lesson == {
        "id": lesson["id"],
        "course_id": course_id,
        "position": 2,
        "title": "บทเรียนที่ 2",
        "subtitle": "",
        "content_md": "",
        "minutes": 20,
        "level": "พื้นฐาน",
        "color": "blue",
        "activity": None,
    }


def test_other_teacher_cannot_touch_lessons(env):
    engine, _, login = env
    course_id = create(login).json()["id"]
    lesson_id = add_lesson(login, course_id)["id"]
    assert [r.status_code for r in lesson_requests(login("b"), course_id, lesson_id)] == [404] * 4
    set_course(engine, course_id, status="published")
    assert [r.status_code for r in lesson_requests(login("b"), course_id, lesson_id)] == [403] * 4
    assert [r.status_code for r in lesson_requests(login(None), course_id, lesson_id)] == [401] * 4


def test_published_content_is_hidden_from_non_managers(env):
    engine, _, login = env
    course_id = create(login).json()["id"]
    lesson_id = add_lesson(login, course_id)["id"]
    login("a").patch(f"/api/lessons/{lesson_id}", json={"content_md": "secret", "subtitle": "s"})
    set_course(engine, course_id, status="published")
    for who in ("learner", "b", None):
        assert [row["content_md"] for row in lesson_rows(login, course_id, who)] == [""]
        lookup = login(who).get(f"/api/lessons/{lesson_id}")
        assert lookup.json() == {
            "locked": True,
            "lesson": {"id": lesson_id, "course_id": course_id, "title": "บทเรียนที่ 1", "subtitle": "s"},
        }
        assert "secret" not in lookup.text
    for who in ("a", "admin"):
        assert [row["content_md"] for row in lesson_rows(login, course_id, who)] == ["secret"]
        lookup = login(who).get(f"/api/lessons/{lesson_id}").json()
        assert (lookup["locked"], lookup["lesson"]["content_md"]) == (False, "secret")


def test_draft_lessons_are_404_for_non_managers(env):
    _, _, login = env
    course_id = create(login).json()["id"]
    lesson_id = add_lesson(login, course_id)["id"]
    for who in ("learner", "b", None):
        assert login(who).get(f"/api/lessons/{lesson_id}").status_code == 404
        assert login(who).get(f"/api/courses/{course_id}/lessons").status_code == 404


def test_delete_renumbers_and_updates_lesson_count(env):
    _, _, login = env
    course_id = create(login).json()["id"]
    ids = [add_lesson(login, course_id)["id"] for _ in range(3)]
    assert login("a").get(f"/api/courses/{course_id}").json()["lesson_count"] == 3
    assert login("a").delete(f"/api/lessons/{ids[1]}").status_code == 204
    assert [(r["id"], r["position"]) for r in lesson_rows(login, course_id)] == [(ids[0], 1), (ids[2], 2)]
    assert login("a").get(f"/api/courses/{course_id}").json()["lesson_count"] == 2
    assert login("a").get("/api/courses/managed").json()["items"][0]["lesson_count"] == 2
    assert login("a").get(f"/api/lessons/{ids[1]}").status_code == 404
    assert login("a").delete(f"/api/lessons/{ids[1]}").status_code == 404
    assert add_lesson(login, course_id)["position"] == 3


def test_move_swaps_neighbours_and_ignores_edges(env):
    _, _, login = env
    course_id = create(login).json()["id"]
    first, second, third = [add_lesson(login, course_id)["id"] for _ in range(3)]

    def move(lesson_id, direction):
        response = login("a").post(f"/api/lessons/{lesson_id}/move", json={"direction": direction})
        assert response.status_code == 200
        assert [row["position"] for row in response.json()] == [1, 2, 3]
        return [row["id"] for row in response.json()]

    assert move(first, -1) == [first, second, third]
    assert move(third, 1) == [first, second, third]
    assert move(third, -1) == [first, third, second]
    assert [row["id"] for row in lesson_rows(login, course_id)] == [first, third, second]
    assert login("a").post(f"/api/lessons/{first}/move", json={"direction": 2}).status_code == 422


def test_lesson_patch_validation(env):
    _, _, login = env
    course_id = create(login).json()["id"]
    url = f"/api/lessons/{add_lesson(login, course_id)['id']}"
    client = login("a")
    assert client.patch(url, json={"minutes": 0}).json()["minutes"] == 1
    assert client.patch(url, json={"minutes": 999}).json()["minutes"] == 600
    edited = client.patch(url, json={"title": "  T  ", "subtitle": "  s  ", "content_md": "  ## h\n", "level": "ขั้นสูง"})
    assert [edited.json()[k] for k in ("title", "subtitle", "content_md", "level")] == ["T", "s", "  ## h\n", "ขั้นสูง"]
    for bad in (
        {"level": "x"},
        {"title": "   "},
        {"title": "x" * 121},
        {"subtitle": "x" * 201},
        {"content_md": "x" * 20001},
        {"minutes": "abc"},
        {"minutes": None},
        {"title": None},
        {"position": 5},
        {"course_id": 99},
    ):
        assert client.patch(url, json=bad).status_code == 422, bad


def test_lesson_changes_are_audited_and_touch_the_course(env):
    engine, users, login = env
    course_id = create(login).json()["id"]
    old = utc_now().replace(year=2000)

    def touched(request) -> bool:
        set_course(engine, course_id, updated_at=old)
        request()
        return not login("a").get(f"/api/courses/{course_id}").json()["updated_at"].startswith("2000")

    ids = []
    assert touched(lambda: ids.append(add_lesson(login, course_id)["id"]))
    assert touched(lambda: ids.append(add_lesson(login, course_id)["id"]))
    assert touched(lambda: login("a").patch(f"/api/lessons/{ids[0]}", json={"title": "New", "minutes": 20}))
    assert touched(lambda: login("a").post(f"/api/lessons/{ids[0]}/move", json={"direction": 1}))
    assert touched(lambda: login("a").delete(f"/api/lessons/{ids[0]}"))
    with Session(engine) as db:
        rows = db.scalars(select(AuditLog).where(AuditLog.target_type == "lesson").order_by(AuditLog.id)).all()
        assert [(row.action, row.target_id, row.status_code) for row in rows] == [
            ("lesson.create", str(ids[0]), 201),
            ("lesson.create", str(ids[1]), 201),
            ("lesson.update", str(ids[0]), 200),
            ("lesson.delete", str(ids[0]), 204),
        ]
        assert rows[2].details == {"fields": ["title"]}
        assert {row.actor_id for row in rows} == {users["a"].id}


def test_deleted_course_hides_every_lesson_endpoint(env):
    engine, _, login = env
    course_id = create(login).json()["id"]
    lesson_id = add_lesson(login, course_id)["id"]
    set_course(engine, course_id, deleted_at=utc_now())
    client = login("admin")
    responses = lesson_requests(client, course_id, lesson_id) + [
        client.get(f"/api/courses/{course_id}/lessons"),
        client.get(f"/api/lessons/{lesson_id}"),
    ]
    assert [r.status_code for r in responses] == [404] * 6
    with Session(engine) as db:
        assert db.get(Lesson, lesson_id).deleted_at is None
