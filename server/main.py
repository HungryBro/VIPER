# server/main.py
import os
from fastapi import FastAPI, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .utils_io import save_upload, static_url, ensure_dirs, OUT, UPLOAD_DIR
from .routers import (
    features, matching, alignment, quality, 
    classification, 
    # enhancement, restoration, segmentation
)

from .database import engine, get_db
from . import models

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="VIPER Unified API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

ensure_dirs(UPLOAD_DIR, OUT)
app.mount("/static", StaticFiles(directory=OUT), name="static")
app.include_router(features.router,       prefix="/api/feature")
app.include_router(matching.router,       prefix="/api/match")
app.include_router(alignment.router,      prefix="/api/alignment")
app.include_router(quality.router,        prefix="/api/quality")
app.include_router(classification.router, prefix="/api/classify")
# app.include_router(enhancement.router,    prefix="/api/enhancement")
# app.include_router(restoration.router,    prefix="/api/restoration")
# app.include_router(segmentation.router,   prefix="/api/segmentation")


@app.post("/api/upload")
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


@app.get("/api/db-test")
def test_database(db: Session = Depends(get_db)):
    new_run = models.ProcessingRun(workflow_name="VIPER Core Test")
    db.add(new_run)
    db.commit()
    db.refresh(new_run)
    
    new_result = models.AlgorithmResult(
        run_id=new_run.id,
        node_type="sift",
        parameters={"nfeatures": 500, "contrastThreshold": 0.04}, 
        json_output_path="outputs/samples/json/feature/sift_test.json"
    )
    db.add(new_result)
    db.commit()
    
    return {
        "message": "บันทึกข้อมูลลง PostgreSQL สำเร็จ!", 
        "run_id": new_run.id,
        "workflow": new_run.workflow_name
    }