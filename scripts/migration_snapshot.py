"""Capture a row-level snapshot of the VIPER database before the mockup v2 migration.

The snapshot stores row counts, the highest id and a SHA-256 hash for every row of
the tables that hold real data. It stores no column values, so it is safe to commit.
``scripts/verify_migration.py`` (T21) compares the live database against it to prove
that no existing row disappeared or changed during the migration.

Usage (from the VIPER root):

    ./.venv/bin/python scripts/migration_snapshot.py
    ./.venv/bin/python scripts/migration_snapshot.py --output -            # print only
    ./.venv/bin/python scripts/migration_snapshot.py --database-url postgresql://...

Hashing rules (T21 must reuse them exactly):

* Every row is turned into a dict of ``{column: value}`` for the columns listed in
  ``tables.<name>.hashed_columns``, then serialised with ``canonical_json`` and hashed
  with SHA-256. Columns added after the snapshot (for example ``users.can_teach``) are
  therefore ignored automatically.
* ``hashed_columns`` leaves out the columns in ``VOLATILE_COLUMNS``. Those change
  through normal use (logins, edits). ``row_hashes_full`` adds a second hash that
  includes them, for the small tables that have such columns.
* Timestamps are read with the session time zone set to UTC and written in ISO 8601.
* ``audit_logs`` keeps growing while the app runs. Compare only ids up to ``max_id``.
"""

from __future__ import annotations

import argparse
import datetime as dt
import decimal
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = PROJECT_ROOT / "tasks" / "baseline" / "db-snapshot.json"
OFFICIAL_SEED = PROJECT_ROOT / "server" / "official_templates.json"

SNAPSHOT_TABLES = ("users", "templates", "comments", "audit_logs", "results")

# Columns that change through normal use and must not count as "data changed".
VOLATILE_COLUMNS: dict[str, tuple[str, ...]] = {
    "users": ("last_login_at", "updated_at"),
    "templates": ("updated_at",),
}

# Row counts recorded in tasks/plan.md (16 Nov 2026, after the untangle refactor).
PLAN_BASELINE_COUNTS = {
    "users": 4,
    "templates": 13,
    "comments": 1,
    "audit_logs": 2626,
    "results": 31,
}


def _json_default(value: Any) -> Any:
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return bytes(value).hex()
    raise TypeError(f"Cannot serialise {type(value).__name__}")


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        default=_json_default,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def sha256(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def row_hash(row: dict[str, Any], columns: list[str]) -> str:
    return sha256(canonical_json({column: row[column] for column in columns}))


def table_columns(conn, table: str) -> list[str]:
    result = conn.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :table "
            "ORDER BY ordinal_position"
        ),
        {"table": table},
    )
    return [r[0] for r in result]


def snapshot_table(conn, table: str) -> dict[str, Any]:
    columns = table_columns(conn, table)
    if not columns:
        raise RuntimeError(f"Table {table!r} not found")
    volatile = [c for c in VOLATILE_COLUMNS.get(table, ()) if c in columns]
    hashed_columns = [c for c in columns if c not in volatile]

    rows = conn.execute(text(f'SELECT * FROM "{table}" ORDER BY id')).mappings().all()
    row_hashes = {str(r["id"]): row_hash(dict(r), hashed_columns) for r in rows}

    entry: dict[str, Any] = {
        "row_count": len(rows),
        "max_id": max((r["id"] for r in rows), default=None),
        "columns": columns,
        "hashed_columns": hashed_columns,
        "volatile_columns": volatile,
        "table_hash": sha256(canonical_json(row_hashes)),
        "row_hashes": row_hashes,
    }
    if volatile:
        full = {str(r["id"]): row_hash(dict(r), columns) for r in rows}
        entry["row_hashes_full"] = full
    return entry


def official_template_notes(conn) -> dict[str, Any]:
    rows = conn.execute(
        text(
            "SELECT id, official_key, "
            "COALESCE(jsonb_array_length(workflow->'nodes'), 0) AS nodes, "
            "COALESCE(jsonb_array_length(workflow->'edges'), 0) AS edges "
            "FROM templates WHERE is_official ORDER BY id"
        )
    ).mappings().all()

    seed = json.loads(OFFICIAL_SEED.read_text(encoding="utf-8"))
    seed_enabled = sorted(i["official_key"] for i in seed if i.get("enabled", True))
    seed_hidden = sorted(i["official_key"] for i in seed if not i.get("enabled", True))
    db_keys = sorted(r["official_key"] for r in rows)

    return {
        "count_in_db": len(rows),
        "with_workflow": sum(1 for r in rows if r["nodes"] > 0),
        "rows": [dict(r) for r in rows],
        "seed_enabled_keys": seed_enabled,
        "seed_hidden_keys": seed_hidden,
        "db_keys_match_seed_enabled": db_keys == seed_enabled,
        "note": (
            "Official template workflows were filled into the database by the "
            "post-refactor code (commit ab4e0513, uvicorn --reload) before this "
            "snapshot and backup were taken. Only rows with an empty workflow were "
            "filled; no row was removed. This is the post-fill state, not the "
            "pre-refactor state."
        ),
    }


def build_snapshot(database_url: str) -> dict[str, Any]:
    engine = create_engine(database_url)
    with engine.connect() as conn:
        conn.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
        conn.execute(text("SET TIME ZONE 'UTC'"))
        tables = {t: snapshot_table(conn, t) for t in SNAPSHOT_TABLES}
        official = official_template_notes(conn)
        conn.rollback()
    engine.dispose()

    counts = {t: tables[t]["row_count"] for t in SNAPSHOT_TABLES}
    data_hash = sha256(canonical_json({t: tables[t]["table_hash"] for t in SNAPSHOT_TABLES}))
    return {
        "schema_version": 1,
        "captured_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "snapshot_hash": data_hash,
        "counts": counts,
        "matches_plan_baseline": counts == PLAN_BASELINE_COUNTS,
        "plan_baseline_counts": PLAN_BASELINE_COUNTS,
        "official_templates": official,
        "tables": tables,
    }


def resolve_database_url(cli_value: str | None) -> str:
    if cli_value:
        return cli_value
    load_dotenv(PROJECT_ROOT / ".env")
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (pass --database-url or add it to .env)")
    return url


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--database-url", help="defaults to DATABASE_URL from .env")
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help=f"file to write, or '-' for stdout only (default: {DEFAULT_OUTPUT.relative_to(PROJECT_ROOT)})",
    )
    parser.add_argument("--backup-file", help="pg_dump file to record (path and SHA-256)")
    args = parser.parse_args()

    snapshot = build_snapshot(resolve_database_url(args.database_url))

    if args.backup_file:
        backup = Path(args.backup_file).resolve()
        snapshot["backup"] = {
            "path": str(backup.relative_to(PROJECT_ROOT)) if backup.is_relative_to(PROJECT_ROOT) else str(backup),
            "sha256": hashlib.sha256(backup.read_bytes()).hexdigest(),
            "bytes": backup.stat().st_size,
        }

    payload = json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n"
    if args.output == "-":
        sys.stdout.write(payload)
    else:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(payload, encoding="utf-8")
        print(f"wrote {out}")

    print(f"snapshot_hash {snapshot['snapshot_hash']}", file=sys.stderr)
    print(f"counts {snapshot['counts']} matches_plan={snapshot['matches_plan_baseline']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
