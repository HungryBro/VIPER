from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str
    avatar_url: str | None
    role: str
    status: str
    banned_until: datetime | None


class AdminUserPublic(UserPublic):
    provider: str
    last_login_at: datetime | None
    created_at: datetime


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["admin", "user"] | None = None
    status: Literal["active", "banned"] | None = None
    banned_until: datetime | None = None


class WorkflowDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


class TemplateOwnerPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: str
    avatar_url: str | None


class TemplateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)
    visibility: Literal["private", "public"] = "private"
    workflow: WorkflowDocument

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Template name cannot be blank")
        return cleaned

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str) -> str:
        return value.strip()


class TemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    visibility: Literal["private", "public"] | None = None
    workflow: WorkflowDocument | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Template name cannot be blank")
        return cleaned

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set:
            raise ValueError("At least one template field must be provided")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Template fields cannot be null")
        return self


class TemplateSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    owner: TemplateOwnerPublic
    name: str
    description: str
    visibility: Literal["private", "public"]
    comments_enabled: bool
    created_at: datetime
    updated_at: datetime


class TemplateDetail(TemplateSummary):
    workflow: WorkflowDocument


class CommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body")
    @classmethod
    def validate_body(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Comment cannot be blank")
        return cleaned


class CommentPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    template_id: int
    author_id: int
    author: TemplateOwnerPublic
    body: str
    created_at: datetime


class AdminTemplateCommentsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    comments_enabled: bool
