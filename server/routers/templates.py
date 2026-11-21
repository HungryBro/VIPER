import os

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session, joinedload

from ..auth import require_active_user, utc_now
from ..database import get_db
from ..models import AuditLog, Comment, Template, User
from ..official_templates import ensure_official_template_records
from ..schemas import (
    CommentCreate,
    CommentPublic,
    TemplateCreate,
    TemplateDetail,
    TemplateSummary,
    TemplateUpdate,
)
from ..utils_io import OUT, UploadRejected, save_reencoded_cover, static_url


router = APIRouter(prefix="/api/templates", tags=["templates"])

TEMPLATE_COVERS_DIR = os.path.join(OUT, "template_covers")
MAX_TEMPLATE_COVER_BYTES = 5 * 1024 * 1024
ALLOWED_TEMPLATE_COVER_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _template_query():
    # Every lookup and list goes through here, so a soft-deleted template is
    # hidden everywhere (lists, detail, load, comments, update, cover, delete).
    return select(Template).options(joinedload(Template.owner)).where(Template.deleted_at.is_(None))


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


def _can_manage_official(user: User) -> bool:
    """Admins and instructors (can_teach) create, edit and delete Official templates.

    Turning comments on or off stays admin-only (require_admin on the admin route).
    `user` is loaded from the database on every request, so a revoked can_teach
    takes effect immediately.
    """
    return user.role == "admin" or bool(user.can_teach)


def _require_official_workflow_nodes(workflow: dict) -> None:
    # The seed refills an Official workflow that has no nodes, so an empty one
    # would silently turn back into the seeded workflow.
    if not workflow.get("nodes"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="An Official template workflow must contain at least one node",
        )


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
        .where(Template.visibility == "public", Template.is_official.is_(False))
        .order_by(Template.updated_at.desc(), Template.id.desc())
    ).all()


@router.get("/official", response_model=list[TemplateSummary])
def list_official_templates(
    _: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    ensure_official_template_records(db)
    return db.scalars(
        _template_query()
        .where(Template.is_official.is_(True))
        .order_by(Template.name.asc())
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
    visibility = payload.visibility
    workflow = payload.workflow.model_dump(mode="json")
    if payload.is_official:
        if not _can_manage_official(user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only an admin or instructor can create an Official template",
            )
        if "visibility" in payload.model_fields_set and payload.visibility != "public":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="An Official template is always public",
            )
        _require_official_workflow_nodes(workflow)
        visibility = "public"

    template = Template(
        owner_id=user.id,
        name=payload.name,
        description=payload.description,
        visibility=visibility,
        workflow=workflow,
        is_official=payload.is_official,
    )
    db.add(template)
    db.flush()
    _add_audit(
        db,
        actor_id=user.id,
        action="template.create",
        template_id=template.id,
        request=request,
        details={"visibility": template.visibility, "is_official": template.is_official},
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
    if template.visibility == "private" and template.owner_id != user.id:
        # An admin may read someone else's private template, never write on it.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot comment on someone else's private template",
        )
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


@router.delete(
    "/{template_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_template_comment(
    template_id: int,
    comment_id: int,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    # Deleting an owned comment stays available even when new comments are closed.
    _get_visible_template(db, template_id, user)
    comment = db.scalar(
        _comment_query().where(
            Comment.id == comment_id,
            Comment.template_id == template_id,
        )
    )
    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )
    if comment.author_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments",
        )

    db.add(
        AuditLog(
            actor_id=user.id,
            action="comment.delete",
            target_type="comment",
            target_id=str(comment.id),
            details={"template_id": template_id},
            request_path=str(request.url.path),
            status_code=status.HTTP_204_NO_CONTENT,
        )
    )
    db.delete(comment)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: int,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    # Missing, already deleted, or someone else's private template: 404 as when opening it.
    template = _get_visible_template(db, template_id, user)
    if template.is_official:
        if not _can_manage_official(user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only an admin or instructor can delete an Official template",
            )
    elif template.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the template owner can delete it",
        )

    # Conditional update: of two concurrent deletes only one succeeds and logs.
    deleted = db.execute(
        update(Template)
        .where(Template.id == template.id, Template.deleted_at.is_(None))
        .values(deleted_at=utc_now())
        .execution_options(synchronize_session=False)
    )
    if deleted.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    _add_audit(
        db,
        actor_id=user.id,
        action="template.delete",
        template_id=template.id,
        request=request,
        details={
            "name": template.name,
            "is_official": template.is_official,
            "official_key": template.official_key,
            "visibility": template.visibility,
            "owner_id": template.owner_id,
            "deleted_by": {"id": user.id, "display_name": user.display_name},
        },
        status_code=status.HTTP_204_NO_CONTENT,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{template_id}", response_model=TemplateDetail)
def update_template(
    template_id: int,
    payload: TemplateUpdate,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    # Someone else's private template is 404 as in GET and DELETE, so its id
    # cannot be probed; one the caller can see but not edit is 403 below.
    template = _get_visible_template(db, template_id, user)
    values = payload.model_dump(exclude_unset=True)
    becomes_official = False
    if template.is_official:
        if not _can_manage_official(user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only an admin or instructor can update an Official template",
            )
        if "visibility" in values:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Official template visibility cannot be changed",
            )
        if values.get("is_official") is False:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="An Official template cannot be changed back to a regular template",
            )
        if payload.workflow is not None:
            _require_official_workflow_nodes(payload.workflow.model_dump(mode="json"))
    else:
        if template.owner_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the template owner can update it",
            )
        if values.get("is_official") is True:
            # Only the owner may mark their own template Official, so nobody's
            # template is taken over or published without their action.
            if not _can_manage_official(user):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only an admin or instructor can mark a template as Official",
                )
            if values.get("visibility", "public") != "public":
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="An Official template is always public",
                )
            next_workflow = (
                payload.workflow.model_dump(mode="json") if payload.workflow is not None else template.workflow
            )
            _require_official_workflow_nodes(next_workflow)
            becomes_official = True
            values["visibility"] = "public"

    changes: dict[str, dict[str, object]] = {}
    editable_fields = ("name", "description") if template.is_official else ("name", "description", "visibility")
    for field in editable_fields:
        if field in values and values[field] != getattr(template, field):
            changes[field] = {"from": getattr(template, field), "to": values[field]}
            setattr(template, field, values[field])

    if payload.workflow is not None:
        template.workflow = payload.workflow.model_dump(mode="json")
        changes["workflow"] = {"from": "previous", "to": "updated"}

    if becomes_official:
        template.is_official = True

    visibility_change = changes.pop("visibility", None)
    if changes:
        _add_audit(
            db,
            actor_id=user.id,
            action="template.update",
            template_id=template.id,
            request=request,
            details={"changes": changes},
        )

    if visibility_change is not None:
        _add_audit(
            db,
            actor_id=user.id,
            action="permission.template_visibility_update",
            template_id=template.id,
            request=request,
            details={"visibility": visibility_change},
        )

    if becomes_official:
        _add_audit(
            db,
            actor_id=user.id,
            action="permission.template_official_update",
            template_id=template.id,
            request=request,
            details={"is_official": {"from": False, "to": True}},
        )

    if changes or visibility_change is not None or becomes_official:
        db.commit()

    return db.scalar(_template_query().where(Template.id == template.id))


@router.post("/{template_id}/cover", response_model=TemplateDetail)
async def upload_template_cover(
    template_id: int,
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    # 404 for someone else's private template, as in PATCH (see update_template).
    template = _get_visible_template(db, template_id, user)
    if template.is_official and not _can_manage_official(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an admin or instructor can update an Official template cover",
        )
    if not template.is_official and template.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the template owner can update it",
        )
    if file.content_type not in ALLOWED_TEMPLATE_COVER_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cover image must be a JPEG, PNG, or WebP file",
        )

    contents = await file.read()
    if not contents:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cover image cannot be empty",
        )
    if len(contents) > MAX_TEMPLATE_COVER_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cover image must be 5 MB or smaller",
        )

    # The declared content type only filters early; the bytes decide. The cover
    # is decoded and written again by the server with an extension it picks.
    try:
        saved_path, _ = save_reencoded_cover(contents, TEMPLATE_COVERS_DIR)
    except UploadRejected as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    template.cover_url = static_url(saved_path)
    _add_audit(
        db,
        actor_id=user.id,
        action="template.cover_update",
        template_id=template.id,
        request=request,
        details={"content_type": file.content_type},
    )
    db.commit()
    return db.scalar(_template_query().where(Template.id == template.id))
