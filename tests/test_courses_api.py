import os

os.environ["AUTO_CREATE_TABLES"] = "false"

import re

import pytest
from sqlalchemy import event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from server.auth import utc_now
from server.database import Base
from server.main import app
from server.models import AuditLog, Course, Enrollment, Lesson, User
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
        "learner2": add_user(engine, "c-learner2", "learner2@example.com"),
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


def change_status(login, course_id: int, value: str, who: str | None = "a"):
    return login(who).post(f"/api/courses/{course_id}/status", json={"status": value})


def publishable(login) -> tuple[int, int]:
    course_id = create(login).json()["id"]
    lesson_id = add_lesson(login, course_id)["id"]
    login("a").patch(f"/api/lessons/{lesson_id}", json={"content_md": "## content"})
    return course_id, lesson_id


def blocked(response) -> list[str]:
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "publish_blocked"
    return response.json()["detail"]["blockers"]


def test_publish_needs_a_lesson_with_content(env):
    _, _, login = env
    course = create(login).json()
    course_id = course["id"]
    no_lesson = ["ต้องมีบทเรียนอย่างน้อย 1 บท"]
    no_content = ["ต้องมีบทที่มีเนื้อหาอย่างน้อย 1 บท"]
    assert course["publish_blockers"] == no_lesson
    assert blocked(change_status(login, course_id, "published")) == no_lesson
    lesson_id = add_lesson(login, course_id)["id"]
    login("a").patch(f"/api/lessons/{lesson_id}", json={"content_md": "  \n\t "})
    assert blocked(change_status(login, course_id, "published")) == no_content
    assert login("a").get("/api/courses/managed").json()["items"][0]["publish_blockers"] == no_content
    login("a").patch(f"/api/lessons/{lesson_id}", json={"content_md": "text"})
    published = change_status(login, course_id, "published")
    assert (published.status_code, published.json()["status"], published.json()["publish_blockers"]) == (200, "published", [])


def test_deleted_lesson_does_not_satisfy_publish(env):
    _, _, login = env
    course_id, lesson_id = publishable(login)
    login("a").delete(f"/api/lessons/{lesson_id}")
    assert blocked(change_status(login, course_id, "published")) == ["ต้องมีบทเรียนอย่างน้อย 1 บท"]


def test_status_changes_visibility(env):
    _, _, login = env
    course_id, _ = publishable(login)

    def visible(who=None) -> tuple[bool, int]:
        listed = course_id in [item["id"] for item in login(who).get("/api/courses").json()["items"]]
        return listed, login(who).get(f"/api/courses/{course_id}").status_code

    assert visible() == (False, 404)
    change_status(login, course_id, "published")
    assert visible() == (True, 200)
    learner = login("learner").get(f"/api/courses/{course_id}").json()
    assert (learner["can_manage"], learner["publish_blockers"]) == (False, None)
    assert login("learner").get("/api/courses").json()["items"][0]["publish_blockers"] is None
    for hidden in ("draft", "archived"):
        change_status(login, course_id, "published")
        assert change_status(login, course_id, hidden).json()["status"] == hidden
        assert visible() == (False, 404)
        assert visible("a") == (False, 200)
    assert change_status(login, course_id, "published").status_code == 200
    assert visible() == (True, 200)


def test_status_permissions_and_validation(env):
    _, _, login = env
    course_id, _ = publishable(login)
    assert change_status(login, course_id, "published", "b").status_code == 404
    assert change_status(login, course_id, "published", None).status_code == 401
    assert change_status(login, course_id, "x").status_code == 422
    assert login("a").post(f"/api/courses/{course_id}/status", json={"status": "draft", "x": 1}).status_code == 422
    assert change_status(login, course_id, "published", "admin").status_code == 200
    assert change_status(login, course_id, "draft", "b").status_code == 403


def test_status_audit_skips_unchanged_status(env):
    engine, _, login = env
    course_id, _ = publishable(login)
    for value in ("draft", "published", "published", "archived"):
        assert change_status(login, course_id, value).status_code == 200
    with Session(engine) as db:
        rows = db.scalars(select(AuditLog).where(AuditLog.action == "course.status").order_by(AuditLog.id)).all()
        assert [row.details for row in rows] == [
            {"from": "draft", "to": "published"},
            {"from": "published", "to": "archived"},
        ]


def test_publish_requires_lab_switch_is_wired(env, monkeypatch):
    _, _, login = env
    course_id, _ = publishable(login)
    monkeypatch.setattr(courses_router, "PUBLISH_REQUIRES_LAB", True)
    with pytest.raises(NotImplementedError):
        change_status(login, course_id, "published")


def join(login, course_id: int, who: str | None = "learner"):
    return login(who).post(f"/api/courses/{course_id}/enroll")


def leave(login, course_id: int, who: str | None = "learner"):
    return login(who).post(f"/api/courses/{course_id}/unenroll")


def published_course(login) -> tuple[int, int]:
    course_id, lesson_id = publishable(login)
    assert change_status(login, course_id, "published").status_code == 200
    return course_id, lesson_id


def reading(login, course_id: int, lesson_id: int, who: str | None = "learner"):
    """(course status code, list contents or status code, lesson locked or status code)"""
    course = login(who).get(f"/api/courses/{course_id}").status_code
    rows = login(who).get(f"/api/courses/{course_id}/lessons")
    lookup = login(who).get(f"/api/lessons/{lesson_id}")
    return (
        course,
        [row["content_md"] for row in rows.json()] if rows.status_code == 200 else rows.status_code,
        lookup.json()["locked"] if lookup.status_code == 200 else lookup.status_code,
    )


CAN_READ = (200, ["## content"], False)
LOCKED = (200, [""], True)
HIDDEN = (404, 404, 404)


def enrollment_rows(engine) -> list[tuple[int, int, str]]:
    with Session(engine) as db:
        return [(r.id, r.user_id, r.status) for r in db.scalars(select(Enrollment).order_by(Enrollment.id))]


def audit_actions(engine) -> list[str]:
    with Session(engine) as db:
        query = select(AuditLog.action).where(AuditLog.action.like("enrollment.%")).order_by(AuditLog.id)
        return list(db.scalars(query))


def listed(login, course_id: int, who: str | None = "learner") -> bool:
    return course_id in [item["id"] for item in login(who).get("/api/courses").json()["items"]]


def test_enroll_opens_the_lessons_and_is_idempotent(env):
    engine, users, login = env
    course_id, lesson_id = published_course(login)
    assert reading(login, course_id, lesson_id) == LOCKED
    joined = join(login, course_id)
    assert joined.status_code == 200
    assert (joined.json()["enrolled"], joined.json()["enrolled_count"], joined.json()["can_manage"]) == (True, 1, False)
    assert joined.json()["publish_blockers"] is None
    assert reading(login, course_id, lesson_id) == CAN_READ
    assert reading(login, course_id, lesson_id, "learner2") == LOCKED
    assert reading(login, course_id, lesson_id, None) == LOCKED
    assert join(login, course_id).status_code == 200
    assert [row[1:] for row in enrollment_rows(engine)] == [(users["learner"].id, "active")]
    assert audit_actions(engine) == ["enrollment.create"]


def test_unenroll_locks_and_reenroll_reuses_the_row(env):
    engine, users, login = env
    course_id, lesson_id = published_course(login)
    join(login, course_id)
    row_id = enrollment_rows(engine)[0][0]
    left = leave(login, course_id)
    assert (left.status_code, left.json()["enrolled"], left.json()["enrolled_count"]) == (200, False, 0)
    assert reading(login, course_id, lesson_id) == LOCKED
    assert enrollment_rows(engine) == [(row_id, users["learner"].id, "cancelled")]
    assert leave(login, course_id).status_code == 404
    assert leave(login, course_id, "learner2").status_code == 404
    assert join(login, course_id).status_code == 200
    assert enrollment_rows(engine) == [(row_id, users["learner"].id, "active")]
    assert reading(login, course_id, lesson_id) == CAN_READ
    with Session(engine) as db:
        rows = db.scalars(select(AuditLog).where(AuditLog.action.like("enrollment.%")).order_by(AuditLog.id)).all()
        assert [(r.action, r.actor_id, r.target_type, r.target_id, r.status_code) for r in rows] == [
            (action, users["learner"].id, "course", str(course_id), 200)
            for action in ("enrollment.create", "enrollment.cancel", "enrollment.create")
        ]
        assert rows[1].details == {"course_status": "published"}


def test_unpublished_course_stays_open_to_enrolled_learners(env):
    _, _, login = env
    course_id, lesson_id = published_course(login)
    join(login, course_id)
    change_status(login, course_id, "draft")
    assert reading(login, course_id, lesson_id) == CAN_READ
    assert listed(login, course_id)
    assert login("learner").get("/api/courses").json()["items"][0]["status"] == "draft"
    for who in ("learner2", None):
        assert not listed(login, course_id, who)
        assert reading(login, course_id, lesson_id, who) == HIDDEN
    assert join(login, course_id, "learner2").status_code == 404
    # Enrolled on a closed course: enrolling again is refused, and editing is visible but forbidden.
    again = join(login, course_id)
    assert (again.status_code, again.json()["detail"]) == (409, {"code": "course_closed"})
    assert login("learner").patch(f"/api/courses/{course_id}", json={"title": "x"}).status_code == 403
    assert leave(login, course_id).status_code == 204
    assert reading(login, course_id, lesson_id) == HIDDEN


def test_archived_course_is_read_only_for_enrolled_learners(env):
    engine, _, login = env
    course_id, lesson_id = published_course(login)
    join(login, course_id)
    change_status(login, course_id, "archived")
    assert reading(login, course_id, lesson_id) == CAN_READ
    assert listed(login, course_id)
    assert join(login, course_id, "learner2").status_code == 404
    left = leave(login, course_id)
    assert (left.status_code, left.content) == (204, b"")
    assert join(login, course_id).status_code == 404
    assert reading(login, course_id, lesson_id) == HIDDEN
    assert not listed(login, course_id)
    with Session(engine) as db:
        row = db.scalars(select(AuditLog).where(AuditLog.action == "enrollment.cancel")).one()
        assert (row.details, row.status_code) == ({"course_status": "archived"}, 204)


def test_who_may_enroll(env):
    _, _, login = env
    course_id, _ = published_course(login)
    for who in ("a", "admin"):
        refused = join(login, course_id, who)
        assert (refused.status_code, refused.json()["detail"]) == (409, {"code": "manager_cannot_enroll"})
    assert join(login, course_id, "b").status_code == 200
    assert join(login, course_id, None).status_code == 401
    assert leave(login, course_id, None).status_code == 401
    assert join(login, 999999).status_code == 404


def test_enrollment_list_is_for_managers_and_active_only(env):
    engine, users, login = env
    course_id, _ = published_course(login)
    for who in ("learner", "learner2", "b"):
        join(login, course_id, who)
    leave(login, course_id, "b")
    with Session(engine) as db:
        for row in db.scalars(select(Enrollment)):
            row.updated_at = utc_now().replace(year=2000 if row.user_id == users["learner2"].id else 2001)
        db.commit()
    url = f"/api/courses/{course_id}/enrollments"
    for who in ("a", "admin"):
        rows = login(who).get(url).json()
        assert [(r["user_id"], r["name"], r["email"]) for r in rows] == [
            (users["learner2"].id, "learner2", "learner2@example.com"),
            (users["learner"].id, "learner", "learner@example.com"),
        ]
        assert rows[0]["enrolled_at"].startswith("2000")
    for who in ("learner", "b"):
        response = login(who).get(url)
        assert response.status_code == 403
        assert "@example.com" not in response.text
    assert login(None).get(url).status_code == 401
    change_status(login, course_id, "draft")
    assert login("b").get(url).status_code == 404  # not enrolled any more: hidden
    assert login("learner").get(url).status_code == 403  # enrolled: visible, still forbidden
    # No other course response carries an email.
    for who in ("learner", "a"):
        assert "@example.com" not in login(who).get(f"/api/courses/{course_id}").text
        assert "@example.com" not in login(who).get("/api/courses").text


def test_enrolled_count_counts_active_only_without_n_plus_one(env):
    engine, _, login = env
    first, _ = published_course(login)
    join(login, first)
    join(login, first, "learner2")
    leave(login, first, "learner2")

    def queries(who: str, url: str) -> int:
        client = login(who)
        seen: list[str] = []
        listener = lambda *args: seen.append(args[2])
        event.listen(engine, "before_cursor_execute", listener)
        try:
            assert client.get(url).status_code == 200
        finally:
            event.remove(engine, "before_cursor_execute", listener)
        return len(seen)

    urls = [("learner", "/api/courses"), ("a", "/api/courses"), ("a", "/api/courses/managed")]
    one_course = [queries(*item) for item in urls]
    for _ in range(3):
        other, _ = published_course(login)
        join(login, other)
    assert [queries(*item) for item in urls] == one_course
    items = {item["id"]: item for item in login("learner2").get("/api/courses").json()["items"]}
    assert (items[first]["enrolled_count"], items[first]["enrolled"]) == (1, False)
    mine = {item["id"]: item for item in login("learner").get("/api/courses").json()["items"]}
    assert [item["enrolled"] for item in mine.values()] == [True] * 4
    assert login("a").get("/api/courses/managed").json()["items"][-1]["enrolled_count"] >= 1


def test_enroll_race_at_insert_is_not_an_error(env, monkeypatch):
    engine, _, login = env
    course_id, _ = published_course(login)
    join(login, course_id)
    real = courses_router._enrollment_row
    calls = []

    def stale_first(*args):
        calls.append(args)
        return None if len(calls) == 1 else real(*args)

    # The pre-check misses the row another request just inserted: the unique constraint stops the insert.
    monkeypatch.setattr(courses_router, "_enrollment_row", stale_first)
    response = join(login, course_id)
    assert (response.status_code, response.json()["enrolled_count"]) == (200, 1)
    assert len(calls) == 2
    assert len(enrollment_rows(engine)) == 1
    assert audit_actions(engine) == ["enrollment.create"]


def test_deleted_course_cannot_be_enrolled_or_left(env):
    engine, _, login = env
    course_id, _ = published_course(login)
    join(login, course_id)
    set_course(engine, course_id, deleted_at=utc_now())
    assert not listed(login, course_id)
    assert join(login, course_id).status_code == 404
    assert leave(login, course_id).status_code == 404
    assert login("admin").get(f"/api/courses/{course_id}/enrollments").status_code == 404


def remove(login, course_id: int, who: str | None = "a", reason: str | None = None):
    body_ = {} if reason is None else {"json": {"reason": reason}}
    return login(who).request("DELETE", f"/api/courses/{course_id}", **body_)


def everything_is_gone(login, course_id: int, lesson_id: int, who: str) -> None:
    client = login(who)
    base = f"/api/courses/{course_id}"
    responses = [
        client.get(base),
        client.patch(base, json={"title": "x"}),
        client.delete(base),
        client.post(f"{base}/status", json={"status": "published"}),
        client.post(f"{base}/enroll"),
        client.post(f"{base}/unenroll"),
        client.get(f"{base}/enrollments"),
        client.get(f"{base}/lessons"),
        client.post(f"{base}/lessons"),
        client.get(f"/api/lessons/{lesson_id}"),
        client.patch(f"/api/lessons/{lesson_id}", json={"title": "x"}),
        client.delete(f"/api/lessons/{lesson_id}"),
        client.post(f"/api/lessons/{lesson_id}/move", json={"direction": 1}),
    ]
    assert [r.status_code for r in responses] == [404] * len(responses)
    assert not listed(login, course_id, who)
    if who != "learner":
        assert course_id not in [c["id"] for c in client.get("/api/courses/managed").json()["items"]]


def delete_audits(engine) -> list[AuditLog]:
    with Session(engine) as db:
        rows = db.scalars(select(AuditLog).where(AuditLog.action == "course.delete").order_by(AuditLog.id)).all()
        for row in rows:
            db.expunge(row)
        return list(rows)


def test_owner_deletes_an_empty_draft(env):
    engine, users, login = env
    course_id, lesson_id = publishable(login)
    removed_lesson = add_lesson(login, course_id)["id"]
    login("a").delete(f"/api/lessons/{removed_lesson}")
    with Session(engine) as db:
        earlier = db.get(Lesson, removed_lesson).deleted_at
    response = remove(login, course_id)
    assert (response.status_code, response.content) == (204, b"")
    for who in ("a", "admin"):
        everything_is_gone(login, course_id, lesson_id, who)
    with Session(engine) as db:
        course = db.get(Course, course_id)
        assert course.deleted_at is not None
        assert db.get(Lesson, lesson_id).deleted_at == course.deleted_at
        assert db.get(Lesson, removed_lesson).deleted_at == earlier
    (row,) = delete_audits(engine)
    assert (row.actor_id, row.target_type, row.target_id, row.status_code) == (users["a"].id, "course", str(course_id), 204)
    assert row.details == {"status": "draft", "enrolled_count": 0, "reason": None, "by_admin": False}


def test_owner_cannot_delete_published_or_enrolled_courses(env):
    engine, _, login = env
    course_id, _ = published_course(login)

    def refused(code: str) -> None:
        response = remove(login, course_id, "a", "even with a reason")
        assert (response.status_code, response.json()["detail"]) == (409, {"code": code})

    refused("delete_not_draft")
    join(login, course_id)
    change_status(login, course_id, "archived")
    refused("delete_not_draft")
    change_status(login, course_id, "draft")
    refused("delete_has_learners")
    assert delete_audits(engine) == []
    # A cancelled enrollment no longer blocks the owner.
    leave(login, course_id)
    assert remove(login, course_id).status_code == 204


def test_delete_permissions(env):
    engine, users, login = env
    draft = create(login).json()["id"]
    published, _ = published_course(login)
    assert remove(login, draft, "b").status_code == 404
    assert remove(login, draft, "learner").status_code == 404
    assert remove(login, published, "b").status_code == 403
    assert remove(login, published, "learner").status_code == 403
    assert remove(login, published, None).status_code == 401
    set_user(engine, users["a"].id, can_teach=False)
    assert remove(login, published, "a").status_code == 403
    assert remove(login, draft, "a").status_code == 404
    assert delete_audits(engine) == []


@pytest.mark.parametrize("final_status", ["published", "draft", "archived"])
def test_admin_needs_a_reason_when_learners_or_not_draft(env, final_status):
    engine, users, login = env
    course_id, lesson_id = published_course(login)
    join(login, course_id)
    join(login, course_id, "learner2")
    change_status(login, course_id, final_status)
    for reason in (None, "", "   "):
        response = remove(login, course_id, "admin", reason)
        assert (response.status_code, response.json()["detail"]) == (422, {"code": "reason_required"})
    assert remove(login, course_id, "admin", "x" * 501).status_code == 422
    assert login("admin").request("DELETE", f"/api/courses/{course_id}", json={"why": "x"}).status_code == 422
    assert login("admin").get(f"/api/courses/{course_id}").status_code == 200
    assert delete_audits(engine) == []

    before = enrollment_rows(engine)
    assert remove(login, course_id, "admin", "  " + "y" * 500 + "  ").status_code == 204
    assert enrollment_rows(engine) == before  # enrollment rows are left as they were
    (row,) = delete_audits(engine)
    assert row.actor_id == users["admin"].id
    assert row.details == {"status": final_status, "enrolled_count": 2, "reason": "y" * 500, "by_admin": True}
    for who in ("learner", "a"):
        everything_is_gone(login, course_id, lesson_id, who)
    assert login("learner").get("/api/courses").json()["items"] == []


def test_admin_deletes_an_empty_draft_without_a_reason(env):
    engine, _, login = env
    course_id = create(login).json()["id"]
    assert remove(login, course_id, "admin").status_code == 204
    assert delete_audits(engine)[0].details == {"status": "draft", "enrolled_count": 0, "reason": None, "by_admin": True}


def test_admin_needs_a_reason_for_an_empty_published_course(env):
    _, _, login = env
    course_id, _ = published_course(login)
    assert remove(login, course_id, "admin").status_code == 422
    assert remove(login, course_id, "admin", "r").status_code == 204


def test_deleted_code_can_be_used_again_and_other_courses_keep_their_counts(env):
    _, _, login = env
    other, _ = published_course(login)
    add_lesson(login, other)
    join(login, other)
    gone = create(login, code="IMG-101").json()["id"]
    add_lesson(login, gone)
    before = login("a").get(f"/api/courses/{other}").json()
    assert remove(login, gone).status_code == 204
    again = create(login, "b", code="img-101")
    assert (again.status_code, again.json()["code"], again.json()["lesson_count"]) == (201, "IMG-101", 0)
    after = login("a").get(f"/api/courses/{other}").json()
    assert (after["lesson_count"], after["enrolled_count"]) == (before["lesson_count"], before["enrolled_count"]) == (2, 1)
