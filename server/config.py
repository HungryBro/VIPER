import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")


def _admin_emails() -> frozenset[str]:
    raw = os.getenv("VIPER_ADMIN_EMAILS", "")
    return frozenset(email.strip().lower() for email in raw.split(",") if email.strip())


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    backend_url: str = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    session_secret: str = os.getenv(
        "SESSION_SECRET",
        "viper-local-development-session-secret-change-me",
    )
    admin_emails: frozenset[str] = _admin_emails()
    auto_create_tables: bool = _env_bool("AUTO_CREATE_TABLES", True)


settings = Settings()
