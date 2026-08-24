from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..auth import require_active_user
from ..database import get_db
from ..models import AuditLog, Comment, Template, User
from ..schemas import (
    CommentCreate,
    CommentPublic,
    TemplateCreate,
    TemplateDetail,
    TemplateSummary,
    TemplateUpdate,
)


router = APIRouter(prefix="/api/templates", tags=["templates"])


def _template_query():
    return select(Template).options(joinedload(Template.owner))


def _comment_query():
    return select(Comment).options(joinedload(Comment.author))


def _get_visible_template(db: Session, template_id: int, user: User) -> Template:
    template = db.scalar(_template_query().where(Template.id == template_id))
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    can_view = (
        template.visibility == "public"
        or template.owner_id == user.id
        or user.role == "admin"
    )
    if not can_view:
        # Hide private template existence from users who do not own it.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return template


def _add_audit(
    db: Session,
    *,
    actor_id: int,
    action: str,
    template_id: int,
    request: Request,
    details: dict,
    status_code: int = status.HTTP_200_OK,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            target_type="template",
            target_id=str(template_id),
            details=details,
            request_path=str(request.url.path),
            status_code=status_code,
        )
    )


@router.get("", response_model=list[TemplateSummary])
def list_public_templates(
    _: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    return db.scalars(
        _template_query()
        .where(Template.visibility == "public")
        .order_by(Template.updated_at.desc(), Template.id.desc())
    ).all()


@router.get("/mine", response_model=list[TemplateSummary])
def list_my_templates(
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    return db.scalars(
        _template_query()
        .where(Template.owner_id == user.id)
        .order_by(Template.updated_at.desc(), Template.id.desc())
    ).all()


@router.post("", response_model=TemplateDetail, status_code=status.HTTP_201_CREATED)
def create_template(
    payload: TemplateCreate,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    template = Template(
        owner_id=user.id,
        name=payload.name,
        description=payload.description,
        visibility=payload.visibility,
        workflow=payload.workflow.model_dump(mode="json"),
    )
    db.add(template)
    db.flush()
    _add_audit(
        db,
        actor_id=user.id,
        action="template.create",
        template_id=template.id,
        request=request,
        details={"visibility": template.visibility},
        status_code=status.HTTP_201_CREATED,
    )
    db.commit()
    return db.scalar(_template_query().where(Template.id == template.id))


@router.get("/{template_id}", response_model=TemplateDetail)
def get_template(
    template_id: int,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    return _get_visible_template(db, template_id, user)


@router.post("/{template_id}/load", response_model=TemplateDetail)
def load_template(
    template_id: int,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    template = _get_visible_template(db, template_id, user)
    _add_audit(
        db,
        actor_id=user.id,
        action="template.load",
        template_id=template.id,
        request=request,
        details={"owner_id": template.owner_id, "visibility": template.visibility},
    )
    db.commit()
    return template


@router.get("/{template_id}/comments", response_model=list[CommentPublic])
def list_template_comments(
    template_id: int,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    # Reading remains available even when new comments are disabled.
    _get_visible_template(db, template_id, user)
    return db.scalars(
        _comment_query()
        .where(Comment.template_id == template_id)
        .order_by(Comment.created_at.asc(), Comment.id.asc())
    ).all()


@router.post(
    "/{template_id}/comments",
    response_model=CommentPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_template_comment(
    template_id: int,
    payload: CommentCreate,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    template = _get_visible_template(db, template_id, user)
    if not template.comments_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Comments are disabled for this template",
        )

    comment = Comment(template_id=template.id, author_id=user.id, body=payload.body)
    db.add(comment)
    db.flush()
    db.add(
        AuditLog(
            actor_id=user.id,
            action="comment.create",
            target_type="comment",
            target_id=str(comment.id),
            details={"template_id": template.id},
            request_path=str(request.url.path),
            status_code=status.HTTP_201_CREATED,
        )
    )
    db.commit()
    return db.scalar(_comment_query().where(Comment.id == comment.id))


@router.patch("/{template_id}", response_model=TemplateDetail)
def update_template(
    template_id: int,
    payload: TemplateUpdate,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    template = db.scalar(_template_query().where(Template.id == template_id))
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    if template.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the template owner can update it",
        )

    changes: dict[str, dict[str, object]] = {}
    values = payload.model_dump(exclude_unset=True)
    for field in ("name", "description", "visibility"):
        if field in values and values[field] != getattr(template, field):
            changes[field] = {"from": getattr(template, field), "to": values[field]}
            setattr(template, field, values[field])

    if payload.workflow is not None:
        template.workflow = payload.workflow.model_dump(mode="json")
        changes["workflow"] = {"from": "previous", "to": "updated"}

    if changes:
        _add_audit(
            db,
            actor_id=user.id,
            action="template.update",
            template_id=template.id,
            request=request,
            details={"changes": changes},
        )
        db.commit()

    return db.scalar(_template_query().where(Template.id == template.id))
