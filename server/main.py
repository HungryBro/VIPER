# server/main.py
from contextlib import asynccontextmanager
import os
import uuid
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from .audit import audit_processing_activity
from .config import settings
from .utils_io import checked_upload_extension, UploadRejected, static_url, ensure_dirs, OUT, UPLOAD_DIR
from .routers import (
    admin, auth, me, templates,
    features, matching, alignment, quality, 
    classification, detection, evaluation,
    # enhancement, restoration, segmentation
)

from .database import SessionLocal, engine, get_db
from . import models
from .official_templates import ensure_official_template_records


def _ensure_user_columns(bind: Engine | None = None) -> None:
    """Add User fields introduced after the first database installation.

    `bind` defaults to the application engine; tests pass an SQLite engine.
    The SQL runs on both SQLite and PostgreSQL.
    """
    bind = engine if bind is None else bind
    inspector = inspect(bind)
    if "users" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("users")}
    with bind.begin() as connection:
        if "can_teach" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN can_teach BOOLEAN NOT NULL DEFAULT FALSE"))


def _ensure_template_columns(bind: Engine | None = None) -> None:
    """Add Template fields introduced after the first database installation.

    `bind` defaults to the application engine; tests pass an SQLite engine.
    """
    bind = engine if bind is None else bind
    inspector = inspect(bind)
    if "templates" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("templates")}
    with bind.begin() as connection:
        if "cover_url" not in columns:
            connection.execute(text("ALTER TABLE templates ADD COLUMN cover_url VARCHAR(500)"))
        if "is_official" not in columns:
            connection.execute(text("ALTER TABLE templates ADD COLUMN is_official BOOLEAN NOT NULL DEFAULT FALSE"))
        if "official_key" not in columns:
            connection.execute(text("ALTER TABLE templates ADD COLUMN official_key VARCHAR(160)"))
        if "deleted_at" not in columns:
            connection.execute(text("ALTER TABLE templates ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE"))
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_templates_official_key "
            "ON templates (official_key)"
        ))


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_tables:
        models.Base.metadata.create_all(bind=engine)
        _ensure_user_columns()
        _ensure_template_columns()
        with SessionLocal() as db:
            ensure_official_template_records(db)
    yield


app = FastAPI(title="VIPER Unified API", lifespan=lifespan)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    session_cookie="viper_session",
    max_age=8 * 60 * 60,
    same_site="lax",
    # Secure cookie when the backend is served over HTTPS; plain http stays usable on localhost.
    https_only=settings.backend_url.startswith("https://"),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

ensure_dirs(UPLOAD_DIR)

# F3: /api/upload limits. 200 MB per file covers model weights (.pt/.pth) for the U-Net node;
# 200 files and 1 GB per request leave room for a YOLO dataset picked in Multi Image Input.
MAX_UPLOAD_FILE_BYTES = 200 * 1024 * 1024
MAX_UPLOAD_BATCH_BYTES = 1024 * 1024 * 1024
MAX_UPLOAD_FILES = 200
UPLOAD_CHUNK_BYTES = 1024 * 1024


@app.middleware("http")
async def static_nosniff(request: Request, call_next):
    # Files under /static are served by extension; nosniff stops a browser from
    # guessing another type (such as HTML) from the bytes.
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response


app.mount("/static", StaticFiles(directory=OUT), name="static")
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(me.router)
app.include_router(templates.router)
processing_audit_required = [Depends(audit_processing_activity)]
app.include_router(features.router,       prefix="/api/feature", dependencies=processing_audit_required)
app.include_router(matching.router,       prefix="/api/match", dependencies=processing_audit_required)
app.include_router(alignment.router,      prefix="/api/alignment", dependencies=processing_audit_required)
app.include_router(quality.router,        prefix="/api/quality", dependencies=processing_audit_required)
app.include_router(classification.router, prefix="/api/classify", dependencies=processing_audit_required)
app.include_router(detection.router,      prefix="/api/detection", dependencies=processing_audit_required)
app.include_router(evaluation.router,     prefix="/api/evaluation", dependencies=processing_audit_required)
# app.include_router(enhancement.router,    prefix="/api/enhancement")
# app.include_router(restoration.router,    prefix="/api/restoration")
# app.include_router(segmentation.router,   prefix="/api/segmentation")


@app.post("/api/upload", dependencies=processing_audit_required)
async def api_upload(files: list[UploadFile] = File(...)):
    # The type comes from the bytes and the server picks the extension; the bytes
    # are stored unchanged, so the image a node processes is the one uploaded.
    # Every file is checked before any is written, so a rejected batch leaves nothing behind.
    # F3: each file streams to a temporary ".part" file in chunks with size limits, so memory
    # holds one file at most; the batch is renamed into place only when every file passed.
    if len(files) > MAX_UPLOAD_FILES:
        raise HTTPException(status_code=413, detail=f"Upload at most {MAX_UPLOAD_FILES} files at a time")
    ensure_dirs(UPLOAD_DIR)
    parts: list[tuple[str, str, str]] = []  # (client filename, temporary path, extension)
    try:
        total = 0
        for f in files:
            part = os.path.join(UPLOAD_DIR, f"{uuid.uuid4().hex}.part")
            parts.append((f.filename, part, ""))
            size = 0
            with open(part, "wb") as out:
                while chunk := await f.read(UPLOAD_CHUNK_BYTES):
                    size += len(chunk)
                    total += len(chunk)
                    if size > MAX_UPLOAD_FILE_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail=f"{f.filename}: each file must be {MAX_UPLOAD_FILE_BYTES // (1024 * 1024)} MB or smaller",
                        )
                    if total > MAX_UPLOAD_BATCH_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail=f"One upload must be {MAX_UPLOAD_BATCH_BYTES // (1024 * 1024)} MB or smaller in total",
                        )
                    out.write(chunk)
            with open(part, "rb") as written:
                contents = written.read()
            try:
                ext = checked_upload_extension(f.filename, contents)
            except UploadRejected as exc:
                raise HTTPException(status_code=422, detail=f"{f.filename}: {exc}") from exc
            parts[-1] = (f.filename, part, ext)
    except BaseException:
        for _, part, _ in parts:
            if os.path.exists(part):
                os.remove(part)
        raise

    saved = []
    for filename, part, ext in parts:
        path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4().hex}{ext}")
        os.replace(part, path)
        url = static_url(path)
        saved.append({
            "name": filename,
            # F13: "path" was the absolute path on the server (folders and the OS account name).
            # Every processing route resolves /static/... to the file (resolve_image_path), and
            # the Image Input nodes send this value as image_path, so it is the same URL now.
            "path": url,
            "url": url,
        })
    return {"files": saved}


@app.get("/api/health/db")
def database_health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    return {"status": "ok", "database": "postgresql"}
