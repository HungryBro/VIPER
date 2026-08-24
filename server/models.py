from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.types import JSON

from .database import Base


# PostgreSQL keeps workflow data as JSONB while SQLite remains available for
# fast, isolated model tests.
JSON_DOCUMENT = JSON().with_variant(JSONB, "postgresql")


class ImageRecord(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    storage_path = Column(String)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())


class AlgorithmResult(Base):
    __tablename__ = "results"

    id = Column(Integer, primary_key=True, index=True)
    node_type = Column(String, index=True)
    parameters = Column(JSON_DOCUMENT)
    json_path = Column(String, nullable=True)
    vis_path = Column(String, nullable=True)
    json_url = Column(String, nullable=True)
    vis_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'user')", name="ck_users_role"),
        CheckConstraint("status IN ('active', 'banned')", name="ck_users_status"),
    )

    id = Column(Integer, primary_key=True)
    provider = Column(String(32), nullable=False, default="google")
    provider_subject = Column(String(255), nullable=False, unique=True, index=True)
    email = Column(String(320), nullable=False, unique=True, index=True)
    display_name = Column(String(255), nullable=False)
    avatar_url = Column(Text, nullable=True)
    role = Column(String(16), nullable=False, default="user", server_default="user")
    status = Column(String(16), nullable=False, default="active", server_default="active")
    banned_until = Column(DateTime(timezone=True), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    templates = relationship("Template", back_populates="owner")
    comments = relationship("Comment", back_populates="author")


class Template(Base):
    __tablename__ = "templates"
    __table_args__ = (
        CheckConstraint(
            "visibility IN ('private', 'public')",
            name="ck_templates_visibility",
        ),
        Index("ix_templates_visibility_created_at", "visibility", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    owner_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(160), nullable=False)
    description = Column(Text, nullable=False, default="", server_default="")
    visibility = Column(
        String(16),
        nullable=False,
        default="private",
        server_default="private",
    )
    workflow = Column(JSON_DOCUMENT, nullable=False)
    comments_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    owner = relationship("User", back_populates="templates")
    comments = relationship(
        "Comment",
        back_populates="template",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Comment(Base):
    __tablename__ = "comments"
    __table_args__ = (Index("ix_comments_template_created_at", "template_id", "created_at"),)

    id = Column(Integer, primary_key=True)
    template_id = Column(
        Integer,
        ForeignKey("templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    template = relationship("Template", back_populates="comments")
    author = relationship("User", back_populates="comments")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_created_at", "created_at"),
        Index("ix_audit_logs_actor_created_at", "actor_id", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    actor_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    action = Column(String(100), nullable=False, index=True)
    target_type = Column(String(50), nullable=True)
    target_id = Column(String(100), nullable=True)
    details = Column("metadata", JSON_DOCUMENT, nullable=False, default=dict)
    request_path = Column(String(255), nullable=True)
    status_code = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    actor = relationship("User")
