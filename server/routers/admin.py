from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..auth import require_admin, utc_now
from ..config import settings
from ..database import get_db
from ..models import AuditLog, Template, User
from ..schemas import (
    AdminAuditLogPublic,
    AdminTemplateCommentsUpdate,
    AdminUserPublic,
    AdminUserUpdate,
    TemplateSummary,
)


router = APIRouter(prefix="/api/admin", tags=["administration"])


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _add_admin_audit(
    db: Session,
    *,
    admin_id: int,
    action: str,
    target_type: str,
    target_id: int,
    details: dict,
    request: Request,
) -> None:
    db.add(
        AuditLog(
            actor_id=admin_id,
            action=action,
            target_type=target_type,
            target_id=str(target_id),
            details=details,
            request_path=str(request.url.path),
            status_code=status.HTTP_200_OK,
        )
    )


@router.get("/audit-logs", response_model=list[AdminAuditLogPublic])
def list_audit_logs(
    limit: int = Query(default=200, ge=1, le=500),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(AuditLog)
        .options(joinedload(AuditLog.actor))
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
    ).all()


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

    if payload.role is not None and payload.role != target.role:
        previous_role = target.role
        target.role = payload.role
        _add_admin_audit(
            db,
            admin_id=admin.id,
            action="permission.role_update",
            target_type="user",
            target_id=target.id,
            details={"role": {"from": previous_role, "to": payload.role}},
            request=request,
        )

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
            _add_admin_audit(
                db,
                admin_id=admin.id,
                action="ban.apply",
                target_type="user",
                target_id=target.id,
                details={
                    "status": {"from": previous_status, "to": "banned"},
                    "banned_until": {
                        "from": _iso(previous_until),
                        "to": _iso(banned_until),
                    },
                },
                request=request,
            )
    elif payload.status == "active":
        previous_status = target.status
        previous_until = target.banned_until
        target.status = "active"
        target.banned_until = None
        if previous_status != "active" or previous_until is not None:
            _add_admin_audit(
                db,
                admin_id=admin.id,
                action="ban.remove",
                target_type="user",
                target_id=target.id,
                details={
                    "status": {"from": previous_status, "to": "active"},
                    "banned_until": {"from": _iso(previous_until), "to": None},
                },
                request=request,
            )

    db.commit()
    db.refresh(target)
    return target


@router.patch(
    "/templates/{template_id}/comments",
    response_model=TemplateSummary,
)
def update_template_comments(
    template_id: int,
    payload: AdminTemplateCommentsUpdate,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    template = db.scalar(
        select(Template)
        .options(joinedload(Template.owner))
        .where(Template.id == template_id)
    )
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    previous = template.comments_enabled
    template.comments_enabled = payload.comments_enabled
    if previous != payload.comments_enabled:
        _add_admin_audit(
            db,
            admin_id=admin.id,
            action="permission.comments_update",
            target_type="template",
            target_id=template.id,
            details={
                "comments_enabled": {
                    "from": previous,
                    "to": payload.comments_enabled,
                }
            },
            request=request,
        )

    db.commit()
    return db.scalar(
        select(Template)
        .options(joinedload(Template.owner))
        .where(Template.id == template.id)
    )
