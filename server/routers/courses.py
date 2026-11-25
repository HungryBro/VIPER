import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..auth import optional_active_user, require_active_user, utc_now
from ..database import get_db
from ..models import AuditLog, Course, Lesson, User
from ..schemas import (
    CourseCreate,
    CoursePage,
    CoursePublic,
    CourseStatusUpdate,
    CourseUpdate,
    LessonLookupPublic,
    LessonMove,
    LessonPreviewPublic,
    LessonPublic,
    LessonUpdate,
)


router = APIRouter(prefix="/api/courses", tags=["courses"])
lessons_router = APIRouter(prefix="/api/lessons", tags=["lessons"])

# No 0/O/1/I/L, so a code can be read aloud and typed back.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_ATTEMPTS = 10
LIST_LIMIT = 100
# False: publishing needs one lesson with content. True is the mockup rule (platform.mjs
# publishBlockers: at least one lesson with a complete Lab); turn it on once lab_activities exists.
PUBLISH_REQUIRES_LAB = False


def _can_create(user: User) -> bool:
    return user.role == "admin" or bool(user.can_teach)


def _can_manage(user: User | None, course: Course) -> bool:
    # `user` is loaded on every request, so a revoked can_teach takes effect immediately.
    if user is None:
        return False
    return user.role == "admin" or (course.owner_id == user.id and bool(user.can_teach))


def _course_query():
    # Every lookup and list goes through here, so a soft-deleted course is hidden everywhere.
    return select(Course).options(joinedload(Course.owner)).where(Course.deleted_at.is_(None))


def _get_visible_course(db: Session, course_id: int, user: User | None) -> Course:
    course = db.scalar(_course_query().where(Course.id == course_id))
    if course is None or not (course.status == "published" or _can_manage(user, course)):
        # Hide a draft or archived course from anyone who cannot manage it.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


def _require_managed_course(db: Session, course_id: int, user: User) -> Course:
    # 404 when the course is hidden from this user, 403 when it is visible but not theirs to edit.
    course = _get_visible_course(db, course_id, user)
    if not _can_manage(user, course):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the course owner or an admin can edit this course",
        )
    return course


def _lesson_query():
    # Hides soft-deleted lessons and every lesson of a soft-deleted course.
    return (
        select(Lesson)
        .join(Lesson.course)
        .where(Lesson.deleted_at.is_(None), Course.deleted_at.is_(None))
    )


def _course_lessons(db: Session, course_id: int) -> list[Lesson]:
    return list(
        db.scalars(
            _lesson_query().where(Lesson.course_id == course_id).order_by(Lesson.position, Lesson.id)
        )
    )


def _get_visible_lesson(db: Session, lesson_id: int, user: User | None) -> tuple[Lesson, Course]:
    lesson = db.scalar(_lesson_query().where(Lesson.id == lesson_id))
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    return lesson, _get_visible_course(db, lesson.course_id, user)


def _lock_lessons(db: Session, course_id: int) -> list[Lesson]:
    # Positions are read then written: lock the course row so two edits cannot interleave
    # (PostgreSQL; SQLite ignores FOR UPDATE).
    db.execute(select(Course.id).where(Course.id == course_id).with_for_update())
    return _course_lessons(db, course_id)


def _lock_managed_lesson(db: Session, lesson_id: int, user: User) -> tuple[Lesson, Course, list[Lesson]]:
    lesson, course = _get_visible_lesson(db, lesson_id, user)
    _require_managed_course(db, course.id, user)
    lessons = _lock_lessons(db, course.id)
    if lesson not in lessons:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    return lesson, course, lessons


def _touch(course: Course) -> None:
    course.updated_at = utc_now()


def _lesson_view(lesson: Lesson, *, full: bool) -> LessonPublic:
    view = LessonPublic.model_validate(lesson)
    # T6 also gives the full content to learners with an active enrollment.
    return view if full else view.model_copy(update={"content_md": ""})


def _lesson_counts(db: Session, course_ids: list[int]) -> dict[int, int]:
    rows = db.execute(
        select(Lesson.course_id, func.count(Lesson.id))
        .where(Lesson.course_id.in_(course_ids), Lesson.deleted_at.is_(None))
        .group_by(Lesson.course_id)
    )
    return dict(rows.all())


def _blockers_for(contents: list[str]) -> list[str]:
    if PUBLISH_REQUIRES_LAB:
        raise NotImplementedError("PUBLISH_REQUIRES_LAB needs lab_activities")
    if not contents:
        return ["ต้องมีบทเรียนอย่างน้อย 1 บท"]
    if not any(content.strip() for content in contents):
        return ["ต้องมีบทที่มีเนื้อหาอย่างน้อย 1 บท"]
    return []


def _publish_blockers(db: Session, course: Course) -> list[str]:
    return _blockers_for([lesson.content_md for lesson in _course_lessons(db, course.id)])


def _public(
    course: Course, user: User | None, lesson_count: int, publish_blockers: list[str] | None
) -> CoursePublic:
    return CoursePublic(
        id=course.id,
        owner_id=course.owner_id,
        owner_name=course.owner.display_name,
        code=course.code,
        title=course.title,
        description=course.description,
        status=course.status,
        created_at=course.created_at,
        updated_at=course.updated_at,
        lesson_count=lesson_count,
        # T6 fills enrolled_count and enrolled.
        enrolled_count=0,
        enrolled=False,
        can_manage=_can_manage(user, course),
        publish_blockers=publish_blockers,
    )


def _public_one(db: Session, course: Course, user: User | None) -> CoursePublic:
    blockers = _publish_blockers(db, course) if _can_manage(user, course) else None
    return _public(course, user, _lesson_counts(db, [course.id]).get(course.id, 0), blockers)


def _page(db: Session, query, user: User | None) -> CoursePage:
    courses = db.scalars(query.order_by(Course.updated_at.desc(), Course.id.desc())).all()
    counts = _lesson_counts(db, [course.id for course in courses])
    # One query for the lesson contents of every course this user manages (publish blockers).
    contents: dict[int, list[str]] = {course.id: [] for course in courses if _can_manage(user, course)}
    for course_id, content in db.execute(
        select(Lesson.course_id, Lesson.content_md).where(
            Lesson.course_id.in_(list(contents)), Lesson.deleted_at.is_(None)
        )
    ):
        contents[course_id].append(content)
    return CoursePage(
        items=[
            _public(
                course,
                user,
                counts.get(course.id, 0),
                _blockers_for(contents[course.id]) if course.id in contents else None,
            )
            for course in courses
        ],
        next=None,
    )


def _code_in_use(db: Session, code: str, *, exclude_id: int | None = None) -> bool:
    query = select(Course.id).where(Course.code == code, Course.deleted_at.is_(None))
    if exclude_id is not None:
        query = query.where(Course.id != exclude_id)
    return db.scalar(query.limit(1)) is not None


def _code_conflict() -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Course code already in use")


def _generate_code(db: Session) -> str:
    for _ in range(CODE_ATTEMPTS):
        code = "VP-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not _code_in_use(db, code):
            return code
    # 31^6 codes: ten collisions in a row is practically impossible.
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not generate a course code",
    )


def _flush_course(db: Session) -> None:
    # Two requests can pass _code_in_use together; the unique index stops the second one.
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise _code_conflict() from exc


def _add_audit(
    db: Session,
    *,
    actor_id: int,
    action: str,
    target_id: int,
    request: Request,
    details: dict,
    target_type: str = "course",
    status_code: int = status.HTTP_200_OK,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=str(target_id),
            details=details,
            request_path=str(request.url.path),
            status_code=status_code,
        )
    )


@router.get("", response_model=CoursePage)
def list_courses(
    user: User | None = Depends(optional_active_user),
    db: Session = Depends(get_db),
):
    # shortcut: หน้าเดียว ไม่มี cursor, ทำ cursor เมื่อคอร์สเกิน 100
    return _page(db, _course_query().where(Course.status == "published").limit(LIST_LIMIT), user)


@router.get("/managed", response_model=CoursePage)
def list_managed_courses(
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not _can_create(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an admin or instructor can manage courses",
        )
    query = _course_query()
    if user.role != "admin":
        query = query.where(Course.owner_id == user.id)
    return _page(db, query, user)


@router.post("", response_model=CoursePublic, status_code=status.HTTP_201_CREATED)
def create_course(
    payload: CourseCreate,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not _can_create(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an admin or instructor can create a course",
        )
    if payload.code is not None and _code_in_use(db, payload.code):
        raise _code_conflict()

    course = Course(
        owner_id=user.id,
        code=payload.code or _generate_code(db),
        title=payload.title,
        description=payload.description,
        status="draft",
    )
    db.add(course)
    _flush_course(db)
    _add_audit(
        db,
        actor_id=user.id,
        action="course.create",
        target_id=course.id,
        request=request,
        details={"code": course.code, "status": course.status},
        status_code=status.HTTP_201_CREATED,
    )
    db.commit()
    return _public_one(db, db.scalar(_course_query().where(Course.id == course.id)), user)


@router.get("/{course_id}", response_model=CoursePublic)
def get_course(
    course_id: int,
    user: User | None = Depends(optional_active_user),
    db: Session = Depends(get_db),
):
    return _public_one(db, _get_visible_course(db, course_id, user), user)


@router.patch("/{course_id}", response_model=CoursePublic)
def update_course(
    course_id: int,
    payload: CourseUpdate,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    course = _require_managed_course(db, course_id, user)
    changes = {
        field: value
        for field, value in payload.model_dump(exclude_unset=True).items()
        if value is not None and value != getattr(course, field)
    }
    if changes:
        if "code" in changes and _code_in_use(db, changes["code"], exclude_id=course.id):
            raise _code_conflict()
        for field, value in changes.items():
            setattr(course, field, value)
        _flush_course(db)
        _add_audit(
            db,
            actor_id=user.id,
            action="course.update",
            target_id=course.id,
            request=request,
            details={"fields": list(changes)},
        )
        db.commit()
    return _public_one(db, db.scalar(_course_query().where(Course.id == course_id)), user)


@router.post("/{course_id}/status", response_model=CoursePublic)
def set_course_status(
    course_id: int,
    payload: CourseStatusUpdate,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    course = _require_managed_course(db, course_id, user)
    # Same lock as lesson edits, so the blockers cannot change while publishing.
    _lock_lessons(db, course.id)
    db.refresh(course, attribute_names=["status"])
    previous = course.status
    if payload.status != previous:
        if payload.status == "published":
            blockers = _publish_blockers(db, course)
            if blockers:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "publish_blocked", "blockers": blockers},
                )
        course.status = payload.status
        _add_audit(
            db,
            actor_id=user.id,
            action="course.status",
            target_id=course.id,
            request=request,
            details={"from": previous, "to": payload.status},
        )
        db.commit()
    return _public_one(db, db.scalar(_course_query().where(Course.id == course_id)), user)


@router.get("/{course_id}/lessons", response_model=list[LessonPublic])
def list_lessons(
    course_id: int,
    user: User | None = Depends(optional_active_user),
    db: Session = Depends(get_db),
):
    course = _get_visible_course(db, course_id, user)
    full = _can_manage(user, course)
    return [_lesson_view(lesson, full=full) for lesson in _course_lessons(db, course.id)]


@router.post("/{course_id}/lessons", response_model=LessonPublic, status_code=status.HTTP_201_CREATED)
def create_lesson(
    course_id: int,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    course = _require_managed_course(db, course_id, user)
    position = len(_lock_lessons(db, course.id)) + 1
    lesson = Lesson(course_id=course.id, position=position, title=f"บทเรียนที่ {position}")
    db.add(lesson)
    db.flush()
    _touch(course)
    _add_audit(
        db,
        actor_id=user.id,
        action="lesson.create",
        target_type="lesson",
        target_id=lesson.id,
        request=request,
        details={"course_id": course.id},
        status_code=status.HTTP_201_CREATED,
    )
    db.commit()
    db.refresh(lesson)
    return _lesson_view(lesson, full=True)


@lessons_router.get("/{lesson_id}", response_model=LessonLookupPublic)
def get_lesson(
    lesson_id: int,
    user: User | None = Depends(optional_active_user),
    db: Session = Depends(get_db),
):
    lesson, course = _get_visible_lesson(db, lesson_id, user)
    if _can_manage(user, course):
        return LessonLookupPublic(locked=False, lesson=_lesson_view(lesson, full=True))
    return LessonLookupPublic(locked=True, lesson=LessonPreviewPublic.model_validate(lesson))


@lessons_router.patch("/{lesson_id}", response_model=LessonPublic)
def update_lesson(
    lesson_id: int,
    payload: LessonUpdate,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    lesson, course, _ = _lock_managed_lesson(db, lesson_id, user)
    changes = {
        field: value
        for field, value in payload.model_dump(exclude_unset=True).items()
        if value != getattr(lesson, field)
    }
    if changes:
        for field, value in changes.items():
            setattr(lesson, field, value)
        _touch(course)
        _add_audit(
            db,
            actor_id=user.id,
            action="lesson.update",
            target_type="lesson",
            target_id=lesson.id,
            request=request,
            details={"fields": list(changes)},
        )
        db.commit()
        db.refresh(lesson)
    return _lesson_view(lesson, full=True)


@lessons_router.delete("/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lesson(
    lesson_id: int,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    lesson, course, lessons = _lock_managed_lesson(db, lesson_id, user)
    lesson.deleted_at = utc_now()
    for position, other in enumerate((item for item in lessons if item is not lesson), start=1):
        other.position = position
    _touch(course)
    _add_audit(
        db,
        actor_id=user.id,
        action="lesson.delete",
        target_type="lesson",
        target_id=lesson.id,
        request=request,
        details={"course_id": course.id},
        status_code=status.HTTP_204_NO_CONTENT,
    )
    db.commit()


@lessons_router.post("/{lesson_id}/move", response_model=list[LessonPublic])
def move_lesson(
    lesson_id: int,
    payload: LessonMove,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    lesson, course, lessons = _lock_managed_lesson(db, lesson_id, user)
    index = lessons.index(lesson)
    swap = index + payload.direction
    if 0 <= swap < len(lessons):
        lessons[index], lessons[swap] = lessons[swap], lessons[index]
        for position, item in enumerate(lessons, start=1):
            item.position = position
        _touch(course)
        db.commit()
    return [_lesson_view(item, full=True) for item in _course_lessons(db, course.id)]
