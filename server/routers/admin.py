from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_admin, utc_now
from ..config import settings
from ..database import get_db
from ..models import AuditLog, User
from ..schemas import AdminUserPublic, AdminUserUpdate


router = APIRouter(prefix="/api/admin", tags=["administration"])


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


@router.get("/users", response_model=list[AdminUserPublic])
def list_users(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.scalars(select(User).order_by(User.created_at.desc(), User.id.desc())).all()


@router.patch("/users/{user_id}", response_model=AdminUserPublic)
def update_user_access(
    user_id: int,
    payload: AdminUserUpdate,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    requested = payload.model_fields_set
    if not requested:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="At least one access field is required",
        )

    if "banned_until" in requested and payload.status != "banned":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="banned_until requires status='banned'",
        )

    protected_admin = target.email.lower() in settings.admin_emails
    if payload.role == "user" and (target.id == admin.id or protected_admin):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bootstrap or current administrator cannot be demoted",
        )
    if payload.status == "banned" and (target.id == admin.id or protected_admin):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bootstrap or current administrator cannot be banned",
        )

    changes: dict[str, dict[str, str | None]] = {}

    if payload.role is not None and payload.role != target.role:
        changes["role"] = {"from": target.role, "to": payload.role}
        target.role = payload.role

    if payload.status == "banned":
        if payload.banned_until is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="A temporary ban requires banned_until",
            )
        if payload.banned_until.tzinfo is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="banned_until must include a timezone",
            )

        banned_until = payload.banned_until.astimezone(timezone.utc)
        if banned_until <= utc_now():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="banned_until must be in the future",
            )

        previous_status = target.status
        previous_until = target.banned_until
        target.status = "banned"
        target.banned_until = banned_until
        if previous_status != target.status or previous_until != banned_until:
            changes["ban"] = {
                "from": _iso(previous_until),
                "to": _iso(banned_until),
            }
    elif payload.status == "active":
        previous_status = target.status
        previous_until = target.banned_until
        target.status = "active"
        target.banned_until = None
        if previous_status != "active" or previous_until is not None:
            changes["ban"] = {
                "from": _iso(previous_until),
                "to": None,
            }

    if changes:
        db.add(
            AuditLog(
                actor_id=admin.id,
                action="admin.user_access_updated",
                target_type="user",
                target_id=str(target.id),
                details={"changes": changes},
                request_path=str(request.url.path),
                status_code=status.HTTP_200_OK,
            )
        )

    db.commit()
    db.refresh(target)
    return target
