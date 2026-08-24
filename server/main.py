# server/main.py
from contextlib import asynccontextmanager
import os
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from .auth import require_active_user
from .config import settings
from .utils_io import save_upload, static_url, ensure_dirs, OUT, UPLOAD_DIR
from .routers import (
    admin, auth, templates,
    features, matching, alignment, quality, 
    classification, detection,
    # enhancement, restoration, segmentation
)

from .database import engine, get_db
from . import models


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_tables:
        models.Base.metadata.create_all(bind=engine)
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
active_user_required = [Depends(require_active_user)]
app.include_router(features.router,       prefix="/api/feature", dependencies=active_user_required)
app.include_router(matching.router,       prefix="/api/match", dependencies=active_user_required)
app.include_router(alignment.router,      prefix="/api/alignment", dependencies=active_user_required)
app.include_router(quality.router,        prefix="/api/quality", dependencies=active_user_required)
app.include_router(classification.router, prefix="/api/classify", dependencies=active_user_required)
app.include_router(detection.router,      prefix="/api/detection", dependencies=active_user_required)
# app.include_router(enhancement.router,    prefix="/api/enhancement")
# app.include_router(restoration.router,    prefix="/api/restoration")
# app.include_router(segmentation.router,   prefix="/api/segmentation")


@app.post("/api/upload", dependencies=active_user_required)
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
