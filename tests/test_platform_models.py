from sqlalchemy import create_engine, inspect, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from server.database import Base
from server.models import AuditLog, Comment, Template, User


def make_engine():
    return create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


def test_platform_tables_are_created():
    engine = make_engine()
    Base.metadata.create_all(engine)

    table_names = set(inspect(engine).get_table_names())
    assert {"users", "templates", "comments", "audit_logs"} <= table_names


def test_user_template_comment_and_audit_relationships():
    engine = make_engine()
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        user = User(
            provider_subject="google-user-1",
            email="learner@example.com",
            display_name="VIPER Learner",
        )
        template = Template(
            owner=user,
            name="SIFT starter",
            visibility="public",
            workflow={"version": 1, "nodes": [], "edges": []},
        )
        comment = Comment(template=template, author=user, body="Useful workflow")
        audit = AuditLog(
            actor=user,
            action="template.create",
            target_type="template",
            target_id="1",
            details={"visibility": "public"},
        )
        db.add_all([user, template, comment, audit])
        db.commit()

        saved_template = db.scalar(select(Template))
        saved_comment = db.scalar(select(Comment))
        saved_audit = db.scalar(select(AuditLog))

        assert saved_template.owner.email == "learner@example.com"
        assert saved_template.comments_enabled is True
        assert saved_comment.template.name == "SIFT starter"
        assert saved_audit.details == {"visibility": "public"}
