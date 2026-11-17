from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str
    avatar_url: str | None
    role: str
    status: str
    banned_until: datetime | None
    can_teach: bool = False


class AdminUserPublic(UserPublic):
    provider: str
    last_login_at: datetime | None
    created_at: datetime


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["admin", "user"] | None = None
    status: Literal["active", "banned"] | None = None
    banned_until: datetime | None = None
    can_teach: StrictBool | None = None


class AdminAuditActorPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str


class AdminAuditLogPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_id: int | None
    actor: AdminAuditActorPublic | None
    action: str
    target_type: str | None
    target_id: str | None
    details: dict[str, Any]
    request_path: str | None
    status_code: int | None
    created_at: datetime


class AdminAuditActionCount(BaseModel):
    action: str
    count: int


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
    # Only an admin or a user with can_teach may send true (403 otherwise).
    is_official: StrictBool = False

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
    # true marks an owned template as Official; false on an Official is rejected.
    is_official: StrictBool | None = None

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
    cover_url: str | None
    comments_enabled: bool
    is_official: bool = False
    official_key: str | None = None
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


class YOLOAnnotation(BaseModel):
    """One labelled box, as fractions of the image: centre x/y, width and height."""
    class_id: int = Field(ge=0)
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    width: float = Field(gt=0.0, le=1.0)
    height: float = Field(gt=0.0, le=1.0)


# ---- ข้อมูลของผู้ใช้เอง (/api/me/*) ----
# คีย์ใน metadata ของ audit log ที่ผู้ใช้เห็นได้ในประวัติของตัวเอง
# (ไม่รวม owner_id, deleted_by, ชื่อผู้ใช้อื่น หรือ from/to ของการเปลี่ยนสิทธิ์)
ME_ACTIVITY_DETAIL_KEYS = frozenset(
    {"category", "operation", "method", "duration_ms", "success", "visibility", "is_official", "template_id", "provider"}
)


class MeActivityPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: str
    target_type: str | None
    target_id: str | None
    details: dict[str, Any]
    request_path: str | None
    status_code: int | None
    created_at: datetime

    @field_validator("details", mode="before")
    @classmethod
    def _only_safe_details(cls, value: Any) -> dict[str, Any]:
        if not isinstance(value, dict):
            return {}
        return {k: v for k, v in value.items() if k in ME_ACTIVITY_DETAIL_KEYS}


class MeSummary(BaseModel):
    template_count: int
    public_template_count: int
    run_count: int
    activity_count: int
    last_run_at: datetime | None
    last_activity_at: datetime | None
    last_login_at: datetime | None
    member_since: datetime
