from datetime import datetime, timezone
from typing import Any

from authlib.integrations.starlette_client import OAuth
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import AuditLog, User


GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url=GOOGLE_DISCOVERY_URL,
    client_kwargs={"scope": "openid email profile"},
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def user_is_banned(user: User, now: datetime | None = None) -> bool:
    if user.status != "banned":
        return False
    if user.banned_until is None:
        return True

    current = now or utc_now()
    banned_until = user.banned_until
    if banned_until.tzinfo is None:
        banned_until = banned_until.replace(tzinfo=timezone.utc)
    return banned_until > current


def sync_google_user(db: Session, user_info: dict[str, Any]) -> User:
    subject = str(user_info.get("sub") or "").strip()
    email = str(user_info.get("email") or "").strip().lower()
    display_name = str(user_info.get("name") or email).strip()

    if not subject or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account did not provide a valid subject and email",
        )
    if user_info.get("email_verified") is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google email is not verified",
        )

    user = db.scalar(select(User).where(User.provider_subject == subject))
    email_owner = db.scalar(select(User).where(User.email == email))
    if email_owner is not None and (user is None or email_owner.id != user.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already linked to another account",
        )

    if user is None:
        user = User(
            provider="google",
            provider_subject=subject,
            email=email,
            display_name=display_name,
            avatar_url=user_info.get("picture"),
            role="admin" if email in settings.admin_emails else "user",
        )
        db.add(user)
    else:
        user.email = email
        user.display_name = display_name
        user.avatar_url = user_info.get("picture")

    # Environment-admin accounts remain administrators to prevent local lockout.
    if email in settings.admin_emails:
        user.role = "admin"

    user.last_login_at = utc_now()
    db.flush()
    return user


def get_authenticated_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    user = db.get(User, user_id)
    if user is None:
        request.session.clear()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session user no longer exists",
        )
    return user


def require_active_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    user = get_authenticated_user(request, db)
    if user_is_banned(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is banned",
        )

    if user.status == "banned":
        user.status = "active"
        user.banned_until = None
        db.add(
            AuditLog(
                actor_id=user.id,
                action="account.ban_expired",
                target_type="user",
                target_id=str(user.id),
                details={},
                request_path=str(request.url.path),
                status_code=status.HTTP_200_OK,
            )
        )
        db.commit()
        db.refresh(user)

    request.state.current_user = user
    return user


def require_admin(user: User = Depends(require_active_user)) -> User:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return user
