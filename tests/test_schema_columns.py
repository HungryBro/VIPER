"""The startup ALTER helpers in server/main.py add new columns to old tables.

Each test builds the "old" users/templates tables in SQLite exactly as an
installation created before the column existed, inserts rows, runs the helper,
and checks that the new column has its default while every other value stays.
"""

import os

os.environ["AUTO_CREATE_TABLES"] = "false"

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import StaticPool

from server.main import _ensure_template_columns, _ensure_user_columns


OLD_USERS_SQL = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    provider VARCHAR(32) NOT NULL,
    provider_subject VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(320) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(16) NOT NULL DEFAULT 'user',
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    banned_until DATETIME,
    last_login_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""

OLD_TEMPLATES_SQL = """
CREATE TABLE templates (
    id INTEGER PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visibility VARCHAR(16) NOT NULL DEFAULT 'private',
    workflow JSON NOT NULL,
    comments_enabled BOOLEAN NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""

USER_ROWS = [
    (1, "google", "sub-1", "admin@example.com", "Admin", None, "admin", "active", None),
    (2, "google", "sub-2", "learner@example.com", "Learner", "https://a/b.png", "user", "active", None),
    (3, "system", "system:official-templates", "official-templates@viper.local", "VIPER Official", None, "user", "active", None),
    (4, "google", "sub-4", "banned@example.com", "Banned", None, "user", "banned", "2099-01-01 00:00:00"),
]

TEMPLATE_ROWS = [
    (1, 2, "Private one", "mine", "private", '{"version": 1, "nodes": [], "edges": []}', 1),
    (2, 2, "Public one", "", "public", '{"version": 1, "nodes": [{"id": "a"}], "edges": []}', 0),
    (3, 1, "Admin public", "desc", "public", '{"version": 1, "nodes": [], "edges": []}', 1),
]

USER_COLUMNS = "id, provider, provider_subject, email, display_name, avatar_url, role, status, banned_until"
TEMPLATE_COLUMNS = "id, owner_id, name, description, visibility, workflow, comments_enabled"


def make_old_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.begin() as connection:
        connection.execute(text(OLD_USERS_SQL))
        connection.execute(text(OLD_TEMPLATES_SQL))
        for row in USER_ROWS:
            connection.execute(
                text(f"INSERT INTO users ({USER_COLUMNS}) VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i)"),
                dict(zip("abcdefghi", row)),
            )
        for row in TEMPLATE_ROWS:
            connection.execute(
                text(f"INSERT INTO templates ({TEMPLATE_COLUMNS}) VALUES (:a, :b, :c, :d, :e, :f, :g)"),
                dict(zip("abcdefg", row)),
            )
    return engine


def read_rows(engine, table: str, columns: str) -> list[tuple]:
    with engine.connect() as connection:
        return [tuple(row) for row in connection.execute(text(f"SELECT {columns} FROM {table} ORDER BY id"))]


def column_names(engine, table: str) -> set[str]:
    return {column["name"] for column in inspect(engine).get_columns(table)}


def test_user_columns_add_can_teach_false_for_existing_rows_and_keep_other_data():
    engine = make_old_engine()
    users_before = read_rows(engine, "users", "*")
    assert "can_teach" not in column_names(engine, "users")

    _ensure_user_columns(engine)

    assert "can_teach" in column_names(engine, "users")
    assert read_rows(engine, "users", "can_teach") == [(0,), (0,), (0,), (0,)]
    # Every column that existed before keeps exactly the same values.
    assert read_rows(engine, "users", "id, provider, provider_subject, email, display_name, avatar_url, "
                     "role, status, banned_until, last_login_at, created_at, updated_at") == users_before


def test_user_columns_helper_is_idempotent_and_default_applies_to_new_rows():
    engine = make_old_engine()

    _ensure_user_columns(engine)
    with engine.begin() as connection:
        connection.execute(text("UPDATE users SET can_teach = 1 WHERE id = 2"))
    _ensure_user_columns(engine)
    with engine.begin() as connection:
        connection.execute(text(
            "INSERT INTO users (id, provider, provider_subject, email, display_name) "
            "VALUES (5, 'google', 'sub-5', 'new@example.com', 'New')"
        ))

    assert read_rows(engine, "users", "id, can_teach") == [(1, 0), (2, 1), (3, 0), (4, 0), (5, 0)]


def test_template_columns_add_official_fields_to_old_table_and_keep_other_data():
    engine = make_old_engine()
    templates_before = read_rows(engine, "templates", "*")

    _ensure_template_columns(engine)
    _ensure_template_columns(engine)

    assert {"cover_url", "is_official", "official_key"} <= column_names(engine, "templates")
    assert read_rows(engine, "templates", "is_official, official_key, cover_url") == [
        (0, None, None),
        (0, None, None),
        (0, None, None),
    ]
    assert read_rows(engine, "templates", "id, owner_id, name, description, visibility, workflow, "
                     "comments_enabled, created_at, updated_at") == templates_before
    assert "ix_templates_official_key" in {index["name"] for index in inspect(engine).get_indexes("templates")}


def test_column_helpers_skip_missing_tables():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    _ensure_user_columns(engine)
    _ensure_template_columns(engine)

    assert inspect(engine).get_table_names() == []
