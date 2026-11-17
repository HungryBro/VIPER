from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_active_user
from ..database import get_db
from ..models import AuditLog, Template, User
from ..schemas import MeActivityPublic, MeSummary

# ข้อมูลของผู้ใช้ที่เรียกเท่านั้น: ไม่รับ user id จาก client ทุกคำสั่งกรองด้วย user.id จาก session
router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("/activity", response_model=list[MeActivityPublic])
def list_my_activity(
    response: Response,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    action: list[str] | None = Query(default=None),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    conditions = [AuditLog.actor_id == user.id]
    if action:
        conditions.append(AuditLog.action.in_(action))

    total = db.scalar(select(func.count()).select_from(AuditLog).where(*conditions)) or 0
    response.headers["X-Total-Count"] = str(total)
    return db.scalars(
        select(AuditLog)
        .where(*conditions)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()


@router.get("/summary", response_model=MeSummary)
def my_summary(
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    templates = (Template.owner_id == user.id) & Template.deleted_at.is_(None)
    template_count, public_template_count = db.execute(
        select(
            func.count(Template.id),
            func.count(Template.id).filter(Template.visibility == "public"),
        ).where(templates)
    ).one()

    mine = AuditLog.actor_id == user.id
    activity_count, last_activity_at = db.execute(
        select(func.count(AuditLog.id), func.max(AuditLog.created_at)).where(mine)
    ).one()
    run_count, last_run_at = db.execute(
        select(func.count(AuditLog.id), func.max(AuditLog.created_at)).where(
            mine, AuditLog.action == "processing.run"
        )
    ).one()

    return MeSummary(
        template_count=template_count,
        public_template_count=public_template_count,
        run_count=run_count,
        activity_count=activity_count,
        last_run_at=last_run_at,
        last_activity_at=last_activity_at,
        last_login_at=user.last_login_at,
        member_since=user.created_at,
    )
