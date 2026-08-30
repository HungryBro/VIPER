# server/main.py
from contextlib import asynccontextmanager
import os
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from .audit import audit_processing_activity
from .config import settings
from .utils_io import save_upload, static_url, ensure_dirs, OUT, UPLOAD_DIR
from .routers import (
    admin, auth, templates,
    features, matching, alignment, quality, 
    classification, detection, evaluation,
    # enhancement, restoration, segmentation
)

from .database import engine, get_db
from . import models


def _ensure_template_cover_column() -> None:
    """Add the cover column for installations created before Template covers."""
    inspector = inspect(engine)
    if "templates" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("templates")}
    if "cover_url" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE templates ADD COLUMN cover_url VARCHAR(500)"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_tables:
        models.Base.metadata.create_all(bind=engine)
        _ensure_template_cover_column()
    yield


app = FastAPI(title="VIPER Unified API", lifespan=lifespan)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    session_cookie="viper_session",
    max_age=8 * 60 * 60,
    same_site="lax",
    https_only=False,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ensure_dirs(UPLOAD_DIR, OUT)
app.mount("/static", StaticFiles(directory=OUT), name="static")
app.include_router(auth.router)
app.include_router(admin.router)
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
    saved = []
    for f in files:
        path = await save_upload(f, UPLOAD_DIR)
        
        saved.append({
            "name": f.filename,
            "path": path,                 
            "url": static_url(path, OUT)
        })
    return {"files": saved}


@app.get("/api/health/db")
def database_health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    return {"status": "ok", "database": "postgresql"}
