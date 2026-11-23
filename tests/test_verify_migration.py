"""Unit tests for scripts/verify_migration.py (T21).

The script must catch the faults it exists to catch: a snapshot row that
disappeared or changed, a soft-deleted row whose data changed, an API that
returns a different id set from the database, an Official template without a
workflow. Every database here is a throwaway SQLite file.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

os.environ["AUTO_CREATE_TABLES"] = "false"

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from server.database import Base
from server.models import AuditLog, Comment, Template, User
from server.official_templates import OFFICIAL_EMAIL, OFFICIAL_SUBJECT, ensure_official_template_records

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import verify_migration as vm  # noqa: E402
from migration_snapshot import row_hash  # noqa: E402


WORKFLOW = {"version": 1, "nodes": [{"id": "n1", "type": "sift", "position": {"x": 0, "y": 0}, "data": {}}], "edges": []}


@pytest.fixture
def db_url(tmp_path):
    url = f"sqlite:///{tmp_path / 'verify.db'}"
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        admin = User(provider_subject="admin-sub", email="admin@example.com", display_name="Admin", role="admin")
        learner = User(provider_subject="learner-sub", email="learner@example.com", display_name="Learner")
        system = User(
            provider="system",
            provider_subject=OFFICIAL_SUBJECT,
            email=OFFICIAL_EMAIL,
            display_name="VIPER Official",
        )
        db.add_all([admin, learner, system])
        db.flush()
        public = Template(owner_id=learner.id, name="Public", visibility="public", workflow=WORKFLOW)
        private_admin = Template(owner_id=admin.id, name="Admin private", visibility="private", workflow=WORKFLOW)
        private_learner = Template(owner_id=learner.id, name="Learner private", visibility="private", workflow=WORKFLOW)
        official = Template(
            owner_id=system.id,
            name="SIFT",
            visibility="public",
            workflow=WORKFLOW,
            is_official=True,
            official_key="SIFT",
        )
        db.add_all([public, private_admin, private_learner, official])
        db.flush()
        db.add(Comment(template_id=public.id, author_id=admin.id, body="Nice"))
        db.add(Comment(template_id=private_learner.id, author_id=learner.id, body="Note to self"))
        db.commit()
    engine.dispose()
    return url


def read(url: str, table: str) -> list[dict]:
    engine = create_engine(url)
    with engine.connect() as conn:
        rows = vm.read_rows(conn, table)
    engine.dispose()
    return rows


def execute(url: str, sql: str, **params) -> None:
    engine = create_engine(url)
    with engine.begin() as conn:
        conn.execute(text(sql), params)
    engine.dispose()


def snapshot_entry(rows: list[dict], hashed_columns: list[str]) -> dict:
    return {
        "row_count": len(rows),
        "max_id": max(r["id"] for r in rows),
        "hashed_columns": hashed_columns,
        "volatile_columns": [],
        "row_hashes": {str(r["id"]): row_hash(r, hashed_columns) for r in rows},
    }


TEMPLATE_HASHED = [
    "id", "owner_id", "name", "description", "visibility", "workflow",
    "comments_enabled", "created_at", "cover_url", "is_official", "official_key",
]
USER_HASHED = [
    "id", "provider", "provider_subject", "email", "display_name", "avatar_url",
    "role", "status", "banned_until", "created_at",
]


# --- Check 1: snapshot rows -------------------------------------------------

def test_unchanged_table_passes(db_url):
    entry = snapshot_entry(read(db_url, "comments"), ["id", "template_id", "author_id", "body", "created_at"])

    result = vm.compare_snapshot_table("comments", entry, read(db_url, "comments"))

    assert result.status == "PASS"
    assert result.details["missing_ids"] == []
    assert result.details["changed_ids"] == []


def test_deleted_comment_is_reported_as_missing(db_url):
    rows = read(db_url, "comments")
    entry = snapshot_entry(rows, ["id", "template_id", "author_id", "body", "created_at"])
    deleted_id = rows[0]["id"]
    execute(db_url, "DELETE FROM comments WHERE id = :id", id=deleted_id)

    result = vm.compare_snapshot_table("comments", entry, read(db_url, "comments"))

    assert result.status == "FAIL"
    assert result.details["missing_ids"] == [deleted_id]
    assert str(deleted_id) in result.summary


def test_changed_value_is_reported_as_changed(db_url):
    rows = read(db_url, "templates")
    entry = snapshot_entry(rows, TEMPLATE_HASHED)
    execute(db_url, "UPDATE templates SET name = 'Renamed' WHERE id = :id", id=rows[0]["id"])

    result = vm.compare_snapshot_table("templates", entry, read(db_url, "templates"))

    assert result.status == "FAIL"
    assert result.details["changed_ids"] == [rows[0]["id"]]


def test_rows_added_after_the_snapshot_are_allowed(db_url):
    entry = snapshot_entry(read(db_url, "comments"), ["id", "template_id", "author_id", "body", "created_at"])
    execute(db_url, "INSERT INTO comments (template_id, author_id, body, created_at) VALUES (1, 1, 'new', '2026-11-20')")

    result = vm.compare_snapshot_table("comments", entry, read(db_url, "comments"))

    assert result.status == "PASS"
    assert result.details["new_rows"] == 1


def test_volatile_and_later_columns_are_ignored(db_url):
    # The snapshot hashed_columns decide; updated_at, last_login_at and can_teach are not in them.
    rows = read(db_url, "users")
    entry = snapshot_entry(rows, USER_HASHED)
    execute(
        db_url,
        "UPDATE users SET can_teach = 1, last_login_at = '2026-11-21', updated_at = '2026-11-21' WHERE id = :id",
        id=rows[0]["id"],
    )

    result = vm.compare_snapshot_table("users", entry, read(db_url, "users"))

    assert result.status == "PASS"


def test_snapshot_column_dropped_from_table_fails():
    rows = [{"id": 1, "name": "a"}]
    entry = snapshot_entry([{"id": 1, "name": "a", "gone": None}], ["id", "name", "gone"])

    result = vm.compare_snapshot_table("templates", entry, rows)

    assert result.status == "FAIL"
    assert result.details["missing_columns"] == ["gone"]


# --- Check 3: soft-deleted rows ---------------------------------------------

def test_soft_deleted_snapshot_row_still_matches_its_hash(db_url):
    rows = read(db_url, "templates")
    entry = snapshot_entry(rows, TEMPLATE_HASHED)
    execute(db_url, "UPDATE templates SET deleted_at = '2026-11-20 10:00:00' WHERE id = :id", id=rows[0]["id"])
    current = read(db_url, "templates")

    snapshot_result = vm.compare_snapshot_table("templates", entry, current)
    soft_result = vm.compare_soft_deleted("templates", entry, current)

    assert snapshot_result.status == "PASS"
    assert soft_result.status == "PASS"
    assert soft_result.details["in_snapshot_ids"] == [rows[0]["id"]]


def test_soft_deleted_row_with_changed_data_fails(db_url):
    rows = read(db_url, "templates")
    entry = snapshot_entry(rows, TEMPLATE_HASHED)
    execute(
        db_url,
        "UPDATE templates SET deleted_at = '2026-11-20 10:00:00', description = 'edited' WHERE id = :id",
        id=rows[0]["id"],
    )

    result = vm.compare_soft_deleted("templates", entry, read(db_url, "templates"))

    assert result.status == "FAIL"
    assert result.details["mismatched_ids"] == [rows[0]["id"]]


def test_soft_deleted_rows_created_after_the_snapshot_are_listed_not_failed(db_url):
    rows = read(db_url, "templates")
    entry = snapshot_entry(rows[:-1], TEMPLATE_HASHED)
    execute(db_url, "UPDATE templates SET deleted_at = '2026-11-20 10:00:00' WHERE id = :id", id=rows[-1]["id"])

    result = vm.compare_soft_deleted("templates", entry, read(db_url, "templates"))

    assert result.status == "PASS"
    assert result.details["new_soft_deleted_ids"] == [rows[-1]["id"]]


# --- Check 2: API against the database ----------------------------------------

def test_equal_id_sets_pass():
    result = vm.compare_id_sets("api.users", "users", api_ids=[3, 1, 2], db_ids={1, 2, 3})

    assert result.status == "PASS"


def test_api_missing_id_fails():
    result = vm.compare_id_sets("api.users", "users", api_ids=[1, 2], db_ids={1, 2, 3})

    assert result.status == "FAIL"
    assert result.details["missing_from_api"] == [3]


def test_api_extra_id_fails():
    result = vm.compare_id_sets("api.templates.public", "public templates", api_ids=[1, 2, 9], db_ids={1, 2})

    assert result.status == "FAIL"
    assert result.details["extra_in_api"] == [9]


def test_api_duplicate_id_fails():
    result = vm.compare_id_sets("api.audit_logs", "audit logs", api_ids=[1, 2, 2], db_ids={1, 2})

    assert result.status == "FAIL"
    assert result.details["duplicates"] == [2]


def test_api_total_header_mismatch_fails():
    result = vm.compare_id_sets("api.audit_logs", "audit logs", api_ids=[1, 2], db_ids={1, 2}, api_total=3)

    assert result.status == "FAIL"


def test_api_checks_pass_on_a_consistent_database(db_url):
    # 1,203 audit rows: the script has to page through three pages of 500.
    # The Official seed is written first, so GET /api/templates/official has nothing to add.
    engine = create_engine(db_url)
    with Session(engine) as db:
        ensure_official_template_records(db)
        db.add_all(AuditLog(actor_id=1, action="processing.run", details={}) for _ in range(1203))
        deleted = Template(
            owner_id=1, name="Deleted", visibility="public", workflow=WORKFLOW,
            deleted_at=datetime(2026, 11, 20, tzinfo=timezone.utc),
        )
        db.add(deleted)
        db.commit()
        deleted_id = deleted.id
    engine.dispose()

    with vm.readonly_connection(db_url) as conn:
        identity, checks = vm.run_api_checks(conn, admin_user_id=1)

    by_id = {c.check_id: c for c in checks}
    assert identity["role"] == "admin"
    assert [c.check_id for c in checks if c.status != "PASS"] == []
    assert by_id["api.audit_logs"].details["api_count"] == 1203
    assert by_id["api.audit_logs"].details["pages"] == 3
    assert by_id["api.comments"].details["api_count"] == 2
    assert deleted_id not in by_id["api.templates.public"].details["api_ids"]
    assert by_id["api.templates.official"].details["api_count"] == 10


def test_api_checks_refuse_a_non_admin_identity(db_url):
    with vm.readonly_connection(db_url) as conn:
        with pytest.raises(vm.IdentityError):
            vm.run_api_checks(conn, admin_user_id=2)


def test_readonly_connection_refuses_writes(db_url):
    with vm.readonly_connection(db_url) as conn:
        with pytest.raises(Exception):
            conn.execute(text("DELETE FROM comments"))

    assert len(read(db_url, "comments")) == 2


def test_official_endpoint_that_tries_to_write_is_reported(db_url):
    # The seed has 9 enabled templates and this database has 1, so GET
    # /api/templates/official tries to insert the rest. The read-only
    # connection stops it, and the check names the endpoint.
    with vm.readonly_connection(db_url) as conn:
        _, checks = vm.run_api_checks(conn, admin_user_id=1)

    official = next(c for c in checks if c.check_id == "api.templates.official")
    assert official.status == "FAIL"
    assert "write" in official.summary
    assert len(read(db_url, "templates")) == 4


# --- Check 4: nodes and Official templates ------------------------------------

CATALOG_TS = """
export const NODE_GROUPS = [
  { name: 'Input', headerColor: 'text-teal-400', color: 'bg-teal-600', enabled: true },
  { name: 'Enhancement', headerColor: 'text-indigo-500', color: 'bg-indigo-500', enabled: false },
] as const satisfies readonly NodeGroup[];

export const NODE_CATALOG = [
  // --- Input ---
  { type: 'image-input', label: 'Image Input', group: 'Input', inputs: [], output: 'image', order: 1 },
  { type: 'zeroDce', aliases: ['zero'], label: 'Zero-DCE Lighten', group: 'Enhancement', inputs: ['image'], output: 'image', order: 20 },
] as const satisfies readonly NodeSpec[];
"""


def test_parse_node_catalog_keeps_only_enabled_groups():
    catalog = vm.parse_node_catalog(CATALOG_TS)

    assert catalog["enabled_types"] == ["image-input"]
    assert catalog["disabled_types"] == ["zeroDce"]


def test_real_node_catalog_has_22_enabled_nodes_in_the_lab_library():
    result = vm.check_lab_nodes(ROOT / "my-react-flow-app")

    assert result.status == "PASS", result.summary
    assert len(result.details["enabled_types"]) == 22


SEED = [
    {"official_key": "A", "enabled": True, "workflow": WORKFLOW},
    {"official_key": "B", "workflow": WORKFLOW},
    {"official_key": "C", "enabled": False, "workflow": WORKFLOW},
]


def official_row(row_id, key, workflow=WORKFLOW, deleted_at=None):
    return {"id": row_id, "official_key": key, "workflow": workflow, "deleted_at": deleted_at}


def test_official_rows_matching_enabled_seed_pass():
    rows = [official_row(1, "A"), official_row(2, "B", json.dumps(WORKFLOW))]

    result = vm.check_official_templates(SEED, rows, expected_enabled=2)

    assert result.status == "PASS", result.summary


def test_official_seed_key_without_live_row_fails():
    rows = [official_row(1, "A"), official_row(2, "B", deleted_at="2026-11-20")]

    result = vm.check_official_templates(SEED, rows, expected_enabled=2)

    assert result.status == "FAIL"
    assert result.details["missing_keys"] == ["B"]


def test_official_row_with_empty_workflow_fails():
    rows = [official_row(1, "A"), official_row(2, "B", {"nodes": [], "edges": []})]

    result = vm.check_official_templates(SEED, rows, expected_enabled=2)

    assert result.status == "FAIL"
    assert result.details["empty_workflow_ids"] == [2]
