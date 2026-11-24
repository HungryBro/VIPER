import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

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


# Public (it is in git): anyone who knows it can sign a session cookie for any user.
DEV_SESSION_SECRET = "viper-local-development-session-secret-change-me"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


@dataclass(frozen=True)
class Settings:
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    backend_url: str = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    session_secret: str = os.getenv(
        "SESSION_SECRET",
        DEV_SESSION_SECRET,
    )
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://viper_user:viper_password@localhost:5432/viper_db",
    )
    admin_emails: frozenset[str] = _admin_emails()
    auto_create_tables: bool = _env_bool("AUTO_CREATE_TABLES", True)


settings = Settings()


def check_session_secret(current: Settings) -> None:
    """Refuse to start with the public development secret unless the backend runs on this machine."""
    if current.session_secret == DEV_SESSION_SECRET and urlparse(current.backend_url).hostname not in LOCAL_HOSTS:
        raise RuntimeError("Set SESSION_SECRET in the environment: the default secret is public")


check_session_secret(settings)
