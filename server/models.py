# server/models.py
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime 
from .database import Base

class ImageRecord(Base):
    __tablename__ = "images"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    storage_path = Column(String)
    uploaded_at = Column(DateTime, default=datetime.now) 

class AlgorithmResult(Base):
    __tablename__ = "results"
    id = Column(Integer, primary_key=True, index=True)
    node_type = Column(String, index=True)
    parameters = Column(JSONB)
    
    json_path = Column(String, nullable=True)
    vis_path = Column(String, nullable=True)
    json_url = Column(String, nullable=True)
    vis_url = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.now) 