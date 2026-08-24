from authlib.integrations.base_client.errors import OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..auth import get_authenticated_user, oauth, require_active_user, sync_google_user
from ..config import settings
from ..database import get_db
from ..models import AuditLog, User
from ..schemas import UserPublic


router = APIRouter(prefix="/api/auth", tags=["authentication"])


@router.get("/google/login")
async def google_login(request: Request):
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google SSO is not configured",
        )

    redirect_uri = f"{settings.backend_url}/api/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google authentication failed",
        ) from exc

    user_info = token.get("userinfo")
    if not user_info:
        user_info = await oauth.google.parse_id_token(request, token)

    user = sync_google_user(db, dict(user_info or {}))
    db.add(
        AuditLog(
            actor=user,
            action="auth.login",
            target_type="user",
            target_id=str(user.id),
            details={"provider": "google"},
            request_path=str(request.url.path),
            status_code=status.HTTP_302_FOUND,
        )
    )
    db.commit()
    db.refresh(user)

    request.session.clear()
    request.session["user_id"] = user.id
    return RedirectResponse(url=settings.frontend_url, status_code=status.HTTP_302_FOUND)


@router.get("/me", response_model=UserPublic)
def current_user(user: User = Depends(require_active_user)):
    return user


@router.post("/logout")
def logout(
    request: Request,
    user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
):
    db.add(
        AuditLog(
            actor_id=user.id,
            action="auth.logout",
            target_type="user",
            target_id=str(user.id),
            details={},
            request_path=str(request.url.path),
            status_code=status.HTTP_200_OK,
        )
    )
    db.commit()
    request.session.clear()
    return {"status": "ok"}
