from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


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
