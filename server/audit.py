from time import perf_counter

from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .auth import require_active_user
from .database import get_db
from .models import AuditLog, User


def _processing_target(request_path: str) -> tuple[str, str]:
    parts = [part for part in request_path.strip("/").split("/") if part]
    api_parts = parts[1:] if parts[:1] == ["api"] else parts
    category = api_parts[0] if api_parts else "unknown"
    operation = ".".join(api_parts) if api_parts else "unknown"
    return category, operation


def audit_processing_activity(
    request: Request,
    response: Response,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    started_at = perf_counter()
    error_status: int | None = None

    try:
        yield
    except HTTPException as exc:
        error_status = exc.status_code
        raise
    except RequestValidationError:
        error_status = status.HTTP_422_UNPROCESSABLE_CONTENT
        raise
    except Exception:
        error_status = status.HTTP_500_INTERNAL_SERVER_ERROR
        raise
    finally:
        request_path = str(request.url.path)
        category, operation = _processing_target(request_path)
        status_code = error_status or response.status_code or status.HTTP_200_OK
        duration_ms = max(0, round((perf_counter() - started_at) * 1000))

        try:
            if error_status is not None:
                db.rollback()
            db.add(
                AuditLog(
                    actor_id=user.id,
                    action="processing.upload" if operation == "upload" else "processing.run",
                    target_type="processing",
                    target_id=operation,
                    details={
                        "category": category,
                        "operation": operation,
                        "method": request.method,
                        "duration_ms": duration_ms,
                        "success": status_code < 400,
                    },
                    request_path=request_path,
                    status_code=status_code,
                )
            )
            db.commit()
        except SQLAlchemyError:
            # Audit persistence must never replace the processing response.
            db.rollback()
