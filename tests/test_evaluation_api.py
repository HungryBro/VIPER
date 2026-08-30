from base64 import b64encode
from datetime import timedelta
import json
import os

os.environ["AUTO_CREATE_TABLES"] = "false"

from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from server.auth import utc_now
from server.config import settings
from server.database import Base, get_db
from server.main import app
from server.models import AuditLog, User


def make_engine():
    return create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


def make_client(engine):
    def override_get_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def add_user(engine, subject: str, email: str, **overrides) -> User:
    with Session(engine) as db:
        user = User(
            provider_subject=subject,
            email=email,
            display_name=email.split("@", 1)[0],
            **overrides,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        db.expunge(user)
        return user


def authenticate(client: TestClient, user_id: int) -> None:
    payload = b64encode(json.dumps({"user_id": user_id}).encode("utf-8"))
    cookie = TimestampSigner(settings.session_secret).sign(payload).decode("utf-8")
    client.cookies.set("viper_session", cookie, domain="testserver.local", path="/")


def test_active_user_can_run_classification_evaluation_and_it_is_audited():
    engine = make_engine()
    Base.metadata.create_all(engine)
    learner = add_user(engine, "learner", "learner@example.com")

    try:
        with make_client(engine) as client:
            authenticate(client, learner.id)
            response = client.post(
                "/api/evaluation/classification",
                json={
                    "class_names": ["negative", "positive"],
                    "y_true": [0, 1, 1, 0],
                    "y_pred": [0, 1, 0, 0],
                    "y_scores": [0.05, 0.95, 0.40, 0.20],
                },
            )

        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "success"
        assert result["tool"] == "ClassificationEvaluation"
        assert result["confusion_matrix"] == [[2, 0], [1, 1]]
        assert result["roc_curves"][0]["auc"] == 1.0

        with Session(engine) as db:
            audit = db.scalar(
                select(AuditLog).where(
                    AuditLog.actor_id == learner.id,
                    AuditLog.target_id == "evaluation.classification",
                )
            )
            assert audit is not None
            assert audit.action == "processing.run"
            assert audit.request_path == "/api/evaluation/classification"
            assert audit.status_code == 200
            assert audit.details["category"] == "evaluation"
            assert audit.details["success"] is True
    finally:
        app.dependency_overrides.clear()


def test_evaluation_requires_an_active_authenticated_user():
    engine = make_engine()
    Base.metadata.create_all(engine)
    banned = add_user(
        engine,
        "banned",
        "banned@example.com",
        status="banned",
        banned_until=utc_now() + timedelta(hours=1),
    )

    try:
        with make_client(engine) as client:
            unauthenticated = client.post(
                "/api/evaluation/classification",
                json={"y_true": [0, 1], "y_pred": [0, 1]},
            )
            authenticate(client, banned.id)
            blocked = client.post(
                "/api/evaluation/classification",
                json={"y_true": [0, 1], "y_pred": [0, 1]},
            )

        assert unauthenticated.status_code == 401
        assert blocked.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_evaluation_returns_validation_error_and_audits_failed_processing():
    engine = make_engine()
    Base.metadata.create_all(engine)
    learner = add_user(engine, "learner", "learner@example.com")

    try:
        with make_client(engine) as client:
            authenticate(client, learner.id)
            response = client.post(
                "/api/evaluation/classification",
                json={"y_true": [0, 1], "y_pred": [0]},
            )

        assert response.status_code == 422
        assert response.json()["detail"] == "y_true and y_pred must have the same number of items"

        with Session(engine) as db:
            audit = db.scalar(
                select(AuditLog).where(
                    AuditLog.actor_id == learner.id,
                    AuditLog.target_id == "evaluation.classification",
                )
            )
            assert audit is not None
            assert audit.status_code == 422
            assert audit.details["success"] is False
    finally:
        app.dependency_overrides.clear()
