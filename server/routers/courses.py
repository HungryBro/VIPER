import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..auth import optional_active_user, require_active_user
from ..database import get_db
from ..models import AuditLog, Course, User
from ..schemas import CourseCreate, CoursePage, CoursePublic, CourseUpdate


router = APIRouter(prefix="/api/courses", tags=["courses"])

# No 0/O/1/I/L, so a code can be read aloud and typed back.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_ATTEMPTS = 10
LIST_LIMIT = 100


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


def _public(course: Course, user: User | None) -> CoursePublic:
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
        # T3 fills lesson_count; T6 fills enrolled_count and enrolled.
        lesson_count=0,
        enrolled_count=0,
        enrolled=False,
        can_manage=_can_manage(user, course),
    )


def _page(db: Session, query, user: User | None) -> CoursePage:
    courses = db.scalars(query.order_by(Course.updated_at.desc(), Course.id.desc())).all()
    return CoursePage(items=[_public(course, user) for course in courses], next=None)


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
    course_id: int,
    request: Request,
    details: dict,
    status_code: int = status.HTTP_200_OK,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            target_type="course",
            target_id=str(course_id),
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
        course_id=course.id,
        request=request,
        details={"code": course.code, "status": course.status},
        status_code=status.HTTP_201_CREATED,
    )
    db.commit()
    return _public(db.scalar(_course_query().where(Course.id == course.id)), user)


@router.get("/{course_id}", response_model=CoursePublic)
def get_course(
    course_id: int,
    user: User | None = Depends(optional_active_user),
    db: Session = Depends(get_db),
):
    return _public(_get_visible_course(db, course_id, user), user)


@router.patch("/{course_id}", response_model=CoursePublic)
def update_course(
    course_id: int,
    payload: CourseUpdate,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    course = _get_visible_course(db, course_id, user)
    if not _can_manage(user, course):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the course owner or an admin can edit this course",
        )
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
            course_id=course.id,
            request=request,
            details={"fields": list(changes)},
        )
        db.commit()
    return _public(db.scalar(_course_query().where(Course.id == course_id)), user)
