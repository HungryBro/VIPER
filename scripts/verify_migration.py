"""Check the VIPER database, API and frontend catalog after the mockup v2 migration (T21).

Three groups of checks (tasks/plan.md, "ชั้น 2: ตรวจข้อมูล"):

1. Database against the T1 snapshot (tasks/baseline/db-snapshot.json): every row the
   snapshot recorded still exists and hashes the same. Rows are hashed with the
   snapshot's own ``hashed_columns``, so columns added later (``can_teach``,
   ``deleted_at``, ...) and the volatile ones (``last_login_at``, ``updated_at``) are
   ignored. Rows added after the snapshot are allowed. A soft-deleted template
   (``deleted_at`` set) must still exist and still match its snapshot hash.
2. API against the database: the ids and counts that the GET endpoints behind each
   page return equal a direct SQL query: users, templates in the three tabs (public,
   Official, mine; ``deleted_at IS NULL`` only), comments on every template the caller
   can open, and audit logs across all pages (``limit``/``offset`` plus the
   ``X-Total-Count`` header).
3. Nodes and Official templates: the 22 enabled node types in
   ``my-react-flow-app/src/lib/nodeCatalog.ts`` are all in the Lab library, and the 9
   enabled entries of ``server/official_templates.json`` match live Official rows that
   each have a workflow.

The script never writes to the database:

* It reads through one connection whose transaction is READ ONLY (PostgreSQL:
  ``default_transaction_read_only=on``; SQLite: ``PRAGMA query_only``) and rolls it back
  at the end.
* The API runs in-process (FastAPI ``TestClient``, GET requests only). Its database
  sessions join that same transaction through savepoints, so a ``commit()`` inside an
  endpoint only releases a savepoint. ``GET /api/templates/official`` seeds missing
  Official rows; if it tries to, the write is refused and the check reports it.
* The app lifespan (create tables, seed) does not run: the client is not entered as a
  context manager and ``AUTO_CREATE_TABLES`` is forced to false.

Rows that the running app adds while the script runs (audit logs grow all the time) do
not cause false failures: the transaction is REPEATABLE READ, so the API and the SQL
queries both see the database as it was at the first query, and neither sees later rows.

Before any other API call the script asks ``GET /api/auth/me`` who it is, prints the
answer and stops unless it is the expected active admin.

Usage (from the VIPER root):

    ./.venv/bin/python scripts/verify_migration.py
    ./.venv/bin/python scripts/verify_migration.py --database-url postgresql://.../viper_verify_tmp
    ./.venv/bin/python scripts/verify_migration.py --output -        # no data.json

Exit code: 0 when every check passes, 1 when any check fails, 2 when the run could not
start (no database, wrong identity).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
from base64 import b64encode
from collections import Counter, defaultdict
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Connection, make_url

SCRIPTS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPTS_DIR.parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from migration_snapshot import resolve_database_url, row_hash  # noqa: E402

DEFAULT_SNAPSHOT = PROJECT_ROOT / "tasks" / "baseline" / "db-snapshot.json"
DEFAULT_OUTPUT = PROJECT_ROOT / "outputs" / "parity-report" / "data.json"
FRONTEND_DIR = PROJECT_ROOT / "my-react-flow-app"
OFFICIAL_SEED = PROJECT_ROOT / "server" / "official_templates.json"

# The numbers tasks/plan.md fixes for this migration.
EXPECTED_ENABLED_NODES = 22
EXPECTED_ENABLED_OFFICIAL = 9

AUDIT_PAGE_SIZE = 500  # the API maximum (server/routers/admin.py)
MAX_LISTED_IDS = 200  # longer id lists are left out of data.json

CRITERIA = {
    1: "Snapshot rows still exist and hash the same",
    2: "API ids and counts equal the database",
    3: "Soft-deleted rows still exist and match the snapshot",
    4: "Enabled nodes are in the Lab library; enabled Official templates match the database",
}

_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


class IdentityError(RuntimeError):
    """GET /api/auth/me did not answer with the expected active admin."""


@dataclass
class Check:
    check_id: str
    criterion: int
    status: str  # "PASS" or "FAIL"
    summary: str
    details: dict[str, Any] = field(default_factory=dict)


def _status(ok: bool) -> str:
    return "PASS" if ok else "FAIL"


def _ids_detail(ids: Iterable[int]) -> list[int] | str:
    ids = sorted(ids)
    if len(ids) <= MAX_LISTED_IDS:
        return ids
    return f"{len(ids)} ids from {ids[0]} to {ids[-1]} (list left out)"


# --- Database access -----------------------------------------------------------

@contextmanager
def readonly_connection(database_url: str) -> Iterator[Connection]:
    """One connection inside one read-only transaction that is rolled back at the end."""
    url = make_url(database_url)
    if url.get_backend_name() == "sqlite":
        engine = create_engine(database_url)

        @event.listens_for(engine, "connect")
        def _sqlite_connect(dbapi_connection, _record):
            # pysqlite manages transactions itself unless isolation_level is None;
            # without this SAVEPOINT does not nest inside the outer transaction.
            dbapi_connection.isolation_level = None
            dbapi_connection.execute("PRAGMA query_only = ON")

        @event.listens_for(engine, "begin")
        def _sqlite_begin(connection):
            connection.exec_driver_sql("BEGIN")

        conn = engine.connect()
    else:
        engine = create_engine(
            database_url,
            connect_args={"options": "-c default_transaction_read_only=on -c TimeZone=UTC"},
        )
        conn = engine.connect().execution_options(isolation_level="REPEATABLE READ")

    transaction = conn.begin()
    try:
        if url.get_backend_name() == "sqlite":
            readonly = conn.exec_driver_sql("PRAGMA query_only").scalar() == 1
        else:
            readonly = conn.exec_driver_sql("SHOW transaction_read_only").scalar() == "on"
        if not readonly:
            raise RuntimeError("could not open a read-only transaction")
        yield conn
    finally:
        if transaction.is_active:
            transaction.rollback()
        conn.close()
        engine.dispose()


def read_rows(conn: Connection, table: str) -> list[dict[str, Any]]:
    if not _IDENTIFIER.match(table):
        raise ValueError(f"unexpected table name {table!r}")
    return [dict(r) for r in conn.execute(text(f'SELECT * FROM "{table}" ORDER BY id')).mappings()]


def _db_ids(conn: Connection, sql: str, **params: Any) -> set[int]:
    return {int(r[0]) for r in conn.execute(text(sql), params)}


# --- Check 1 and 3: snapshot ---------------------------------------------------------

def compare_snapshot_table(table: str, entry: dict[str, Any], rows: list[dict[str, Any]]) -> Check:
    """Every snapshot row must exist and hash the same with the snapshot's columns."""
    columns = entry["hashed_columns"]
    expected: dict[str, str] = entry["row_hashes"]
    current = {str(r["id"]): r for r in rows}
    check_id = f"snapshot.{table}"

    missing_columns = [c for c in columns if rows and c not in rows[0]]
    if missing_columns:
        return Check(
            check_id, 1, "FAIL",
            f"columns from the snapshot are gone from {table}: {', '.join(missing_columns)}",
            {"missing_columns": missing_columns, "snapshot_rows": len(expected)},
        )

    missing_ids = sorted(int(i) for i in expected if i not in current)
    changed_ids = sorted(
        int(i) for i, digest in expected.items()
        if i in current and row_hash(current[i], columns) != digest
    )
    new_ids = sorted(int(i) for i in current if i not in expected)
    present = len(expected) - len(missing_ids)

    if missing_ids or changed_ids:
        parts = []
        if missing_ids:
            parts.append(f"missing ids {missing_ids}")
        if changed_ids:
            parts.append(f"changed ids {changed_ids}")
        summary = f"{present}/{len(expected)} snapshot rows present; " + "; ".join(parts)
    else:
        summary = (
            f"{present}/{len(expected)} snapshot rows present, 0 changed, "
            f"{len(new_ids)} added after the snapshot"
        )
    return Check(
        check_id, 1, _status(not missing_ids and not changed_ids), summary,
        {
            "snapshot_rows": len(expected),
            "current_rows": len(rows),
            "missing_columns": [],
            "missing_ids": missing_ids,
            "changed_ids": changed_ids,
            "new_rows": len(new_ids),
            "new_ids": _ids_detail(new_ids),
            "hashed_columns": columns,
            "ignored_columns": sorted(set(rows[0]) - set(columns)) if rows else [],
        },
    )


def compare_soft_deleted(
    table: str, entry: dict[str, Any], rows: list[dict[str, Any]], column: str = "deleted_at"
) -> Check:
    """Soft-deleted rows that the snapshot knows must still hash the same (without ``column``)."""
    check_id = f"soft_deleted.{table}"
    if rows and column not in rows[0]:
        return Check(check_id, 3, "FAIL", f"{table} has no {column} column", {})

    columns = entry["hashed_columns"]
    expected: dict[str, str] = entry["row_hashes"]
    soft = [r for r in rows if r.get(column) is not None]
    in_snapshot = sorted(int(r["id"]) for r in soft if str(r["id"]) in expected)
    mismatched = sorted(
        int(r["id"]) for r in soft
        if str(r["id"]) in expected and row_hash(r, columns) != expected[str(r["id"])]
    )
    new_soft = sorted(int(r["id"]) for r in soft if str(r["id"]) not in expected)

    summary = (
        f"{len(soft)} soft-deleted rows still in the table "
        f"({len(in_snapshot)} from the snapshot, {len(new_soft)} added later {new_soft}); "
    )
    summary += f"hash differs for ids {mismatched}" if mismatched else f"all {len(in_snapshot)} snapshot ones match"
    return Check(
        check_id, 3, _status(not mismatched), summary,
        {
            "soft_deleted_ids": sorted(int(r["id"]) for r in soft),
            "in_snapshot_ids": in_snapshot,
            "mismatched_ids": mismatched,
            "new_soft_deleted_ids": new_soft,
            "excluded_column": column,
        },
    )


def run_snapshot_checks(conn: Connection, snapshot: dict[str, Any]) -> list[Check]:
    checks = []
    for table, entry in snapshot["tables"].items():
        rows = read_rows(conn, table)
        checks.append(compare_snapshot_table(table, entry, rows))
        if table == "templates":
            checks.append(compare_soft_deleted(table, entry, rows))
    return checks


# --- Check 2: API against the database ------------------------------------------------

def compare_id_sets(
    check_id: str,
    label: str,
    api_ids: list[int],
    db_ids: set[int],
    api_total: int | None = None,
    db_total: int | None = None,
    extra: dict[str, Any] | None = None,
) -> Check:
    counts = Counter(api_ids)
    duplicates = sorted(i for i, n in counts.items() if n > 1)
    api_set = set(api_ids)
    missing = sorted(db_ids - api_set)
    extra_ids = sorted(api_set - db_ids)
    db_total = len(db_ids) if db_total is None else db_total
    total_ok = api_total is None or api_total == db_total

    ok = not missing and not extra_ids and not duplicates and len(api_ids) == len(db_ids) and total_ok
    summary = f"{label}: API {len(api_ids)}, database {len(db_ids)}"
    if api_total is not None:
        summary += f", X-Total-Count {api_total}"
    if ok:
        summary += ", same ids"
    else:
        problems = []
        if missing:
            problems.append(f"missing from API {missing[:20]}")
        if extra_ids:
            problems.append(f"not in database {extra_ids[:20]}")
        if duplicates:
            problems.append(f"returned twice {duplicates[:20]}")
        if not total_ok:
            problems.append(f"X-Total-Count {api_total} != database {db_total}")
        summary += "; " + "; ".join(problems)

    details: dict[str, Any] = {
        "api_count": len(api_ids),
        "db_count": len(db_ids),
        "api_ids": _ids_detail(api_set),
        "missing_from_api": missing,
        "extra_in_api": extra_ids,
        "duplicates": duplicates,
    }
    if api_total is not None:
        details["api_total_header"] = api_total
        details["db_total"] = db_total
    details.update(extra or {})
    return Check(check_id, 2, _status(ok), summary, details)


def _session_cookie(user_id: int, secret: str) -> str:
    from itsdangerous import TimestampSigner

    payload = b64encode(json.dumps({"user_id": user_id}).encode("utf-8"))
    return TimestampSigner(secret).sign(payload).decode("utf-8")


def _guarded(check_id: str, label: str, run: Callable[[], Check]) -> Check:
    try:
        return run()
    except Exception as exc:  # one broken endpoint must not hide the other checks
        message = str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__
        if re.search(r"read-only|readonly", str(exc), re.IGNORECASE):
            summary = f"{label}: the endpoint tried to write to the database and was refused ({message})"
        else:
            summary = f"{label}: {type(exc).__name__}: {message}"
        return Check(check_id, 2, "FAIL", summary, {"error": f"{type(exc).__name__}: {message}"})


def run_api_checks(
    conn: Connection, admin_user_id: int, log: Callable[[str], None] = print
) -> tuple[dict[str, Any], list[Check]]:
    """Call the GET endpoints in-process and compare their ids with SQL on ``conn``."""
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session

    from server.config import settings
    from server.database import get_db
    from server.main import app

    def override_get_db():
        db = Session(bind=conn, join_transaction_mode="create_savepoint")
        try:
            yield db
        finally:
            db.close()

    had_override = get_db in app.dependency_overrides
    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    try:
        # Not entered with `with`: the lifespan (create_all, Official seed) must not run.
        client = TestClient(app)
        client.cookies.set(
            "viper_session",
            _session_cookie(admin_user_id, settings.session_secret),
            domain="testserver.local",
            path="/",
        )

        def get(path: str, **params: Any):
            response = client.get(path, params=params or None)
            if response.status_code != 200:
                raise RuntimeError(f"GET {path} returned {response.status_code}: {response.text[:200]}")
            return response

        me_response = client.get("/api/auth/me")
        me = me_response.json() if me_response.status_code == 200 else {}
        identity = {
            "id": me.get("id"),
            "role": me.get("role"),
            "status": me.get("status"),
            "email": me.get("email"),
        }
        log(
            f"identity (GET /api/auth/me): HTTP {me_response.status_code} "
            f"id={identity['id']} email={identity['email']} role={identity['role']} status={identity['status']}"
        )
        if me.get("id") != admin_user_id or me.get("role") != "admin" or me.get("status") != "active":
            raise IdentityError(
                f"expected active admin id={admin_user_id}, GET /api/auth/me answered {me_response.status_code} {identity}"
            )

        visible = "deleted_at IS NULL AND (visibility = 'public' OR owner_id = :uid OR :is_admin)"
        params = {"uid": admin_user_id, "is_admin": True}

        def users() -> Check:
            api = [u["id"] for u in get("/api/admin/users").json()]
            return compare_id_sets("api.users", "users", api, _db_ids(conn, "SELECT id FROM users"))

        def templates(check_id: str, label: str, path: str, where: str) -> Callable[[], Check]:
            def run() -> Check:
                api = [t["id"] for t in get(path).json()]
                db = _db_ids(conn, f"SELECT id FROM templates WHERE deleted_at IS NULL AND {where}", **params)
                return compare_id_sets(check_id, label, api, db)
            return run

        def comments() -> Check:
            template_ids = sorted(_db_ids(conn, f"SELECT id FROM templates WHERE {visible}", **params))
            api: list[int] = []
            wrong_template = []
            for template_id in template_ids:
                for comment in get(f"/api/templates/{template_id}/comments").json():
                    api.append(comment["id"])
                    if comment["template_id"] != template_id:
                        wrong_template.append(comment["id"])
            db = _db_ids(
                conn,
                "SELECT c.id FROM comments c JOIN templates t ON t.id = c.template_id "
                "WHERE t.deleted_at IS NULL AND (t.visibility = 'public' OR t.owner_id = :uid OR :is_admin)",
                **params,
            )
            on_deleted = _db_ids(
                conn,
                "SELECT c.id FROM comments c JOIN templates t ON t.id = c.template_id WHERE t.deleted_at IS NOT NULL",
            )
            result = compare_id_sets(
                "api.comments", "comments", api, db,
                extra={
                    "templates_queried": len(template_ids),
                    "comments_on_soft_deleted_templates": sorted(on_deleted),
                    "returned_under_wrong_template": wrong_template,
                },
            )
            if wrong_template:
                result.status = "FAIL"
                result.summary += f"; returned under another template {wrong_template}"
            return result

        def audit_logs() -> Check:
            api: list[int] = []
            totals: list[int] = []
            offset = 0
            pages = 0
            while True:
                response = get("/api/admin/audit-logs", limit=AUDIT_PAGE_SIZE, offset=offset)
                totals.append(int(response.headers["X-Total-Count"]))
                page = response.json()
                pages += 1
                if not page:
                    break
                api.extend(item["id"] for item in page)
                offset += len(page)
                if offset >= totals[0] or pages > 100_000:
                    break
            db = _db_ids(conn, "SELECT id FROM audit_logs")
            result = compare_id_sets(
                "api.audit_logs", f"audit logs ({pages} pages of up to {AUDIT_PAGE_SIZE})", api, db,
                api_total=totals[0],
                extra={"pages": pages, "page_size": AUDIT_PAGE_SIZE, "total_header_per_page": sorted(set(totals))},
            )
            if len(set(totals)) > 1:
                result.status = "FAIL"
                result.summary += f"; X-Total-Count changed between pages {sorted(set(totals))}"
            return result

        checks = [
            _guarded("api.users", "users", users),
            _guarded("api.templates.public", "public templates",
                     templates("api.templates.public", "public templates (non-Official)", "/api/templates",
                               "visibility = 'public' AND NOT is_official")),
            _guarded("api.templates.official", "Official templates",
                     templates("api.templates.official", "Official templates", "/api/templates/official",
                               "is_official")),
            _guarded("api.templates.mine", "my templates",
                     templates("api.templates.mine", f"my templates (owner {admin_user_id})", "/api/templates/mine",
                               "owner_id = :uid")),
            _guarded("api.comments", "comments", comments),
            _guarded("api.audit_logs", "audit logs", audit_logs),
        ]
        return identity, checks
    finally:
        if had_override:
            app.dependency_overrides[get_db] = previous
        else:
            app.dependency_overrides.pop(get_db, None)


# --- Check 4: nodes and Official templates ---------------------------------------

def _array_block(source: str, name: str) -> str:
    match = re.search(rf"export const {name}\s*=\s*\[(.*?)\]\s*as const", source, re.S)
    if not match:
        raise ValueError(f"{name} not found in nodeCatalog.ts")
    return match.group(1)


def parse_node_catalog(source: str) -> dict[str, Any]:
    """Read NODE_GROUPS and NODE_CATALOG from nodeCatalog.ts without running it."""
    groups = {
        m.group(1): m.group(2) == "true"
        for m in re.finditer(
            r"\{\s*name:\s*'([^']+)'[^}]*?enabled:\s*(true|false)", _array_block(source, "NODE_GROUPS")
        )
    }
    nodes = [
        (m.group(1), m.group(2))
        for m in re.finditer(
            r"^\s*\{\s*type:\s*'([^']+)'.*?group:\s*'([^']+)'", _array_block(source, "NODE_CATALOG"), re.M
        )
    ]
    unknown = sorted({g for _, g in nodes if g not in groups})
    return {
        "groups": groups,
        "enabled_types": [t for t, g in nodes if groups.get(g)],
        "disabled_types": [t for t, g in nodes if not groups.get(g)],
        "unknown_groups": unknown,
    }


def _sidebar_types_from_node(catalog_path: Path) -> tuple[list[str] | None, str]:
    """Run the sidebarGroups() the Lab sidebar calls, when Node can import TypeScript."""
    node = shutil.which("node")
    if node is None:
        return None, "node not found"
    script = (
        f"import {{ sidebarGroups }} from {json.dumps(catalog_path.as_uri())};"
        "console.log(JSON.stringify(sidebarGroups().flatMap((g) => g.algorithms.map((a) => a.type))));"
    )
    try:
        done = subprocess.run(
            [node, "--input-type=module", "-e", script],
            capture_output=True, text=True, timeout=60, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, f"node failed: {exc}"
    if done.returncode != 0:
        return None, f"node exit {done.returncode}: {done.stderr.strip().splitlines()[-1:]}"
    return json.loads(done.stdout.strip().splitlines()[-1]), "ok"


def check_lab_nodes(frontend_dir: Path, expected: int = EXPECTED_ENABLED_NODES) -> Check:
    src = frontend_dir / "src"
    catalog_path = src / "lib" / "nodeCatalog.ts"
    catalog = parse_node_catalog(catalog_path.read_text(encoding="utf-8"))
    enabled = catalog["enabled_types"]
    problems = []

    if len(enabled) != expected:
        problems.append(f"{len(enabled)} enabled node types, plan expects {expected}")
    if catalog["unknown_groups"]:
        problems.append(f"nodes in unknown groups {catalog['unknown_groups']}")

    # The Lab library is the sidebar, and the sidebar lists sidebarGroups() from nodeCatalog.ts.
    sidebar = (src / "components" / "sidebar.tsx").read_text(encoding="utf-8")
    sidebar_uses_catalog = bool(
        re.search(r"import\s*\{[^}]*\bsidebarGroups\b[^}]*\}\s*from\s*'\.\./lib/nodeCatalog'", sidebar)
        and re.search(r"useMemo\(\s*sidebarGroups\b", sidebar)
    )
    if not sidebar_uses_catalog:
        problems.append("sidebar.tsx no longer builds its node list from sidebarGroups()")
    lab_page = (src / "pages" / "LabPage.tsx").read_text(encoding="utf-8")
    lab_renders_sidebar = "<Sidebar" in lab_page and re.search(r"import Sidebar from '\.\./components/sidebar'", lab_page)
    if not lab_renders_sidebar:
        problems.append("LabPage.tsx does not render the sidebar")

    # Each enabled node needs a component and a runner, or the canvas cannot show it.
    registry = (src / "lib" / "nodeRegistry.tsx").read_text(encoding="utf-8")
    implemented = set(re.findall(r"^\s*'?([\w-]+)'?\s*:\s*\{\s*component:", registry, re.M))
    unimplemented = [t for t in enabled if t not in implemented]
    if unimplemented:
        problems.append(f"no implementation in nodeRegistry.tsx for {unimplemented}")

    node_types, node_note = _sidebar_types_from_node(catalog_path)
    if node_types is not None and node_types != enabled:
        problems.append(f"sidebarGroups() returns {node_types}, static parse found {enabled}")

    summary = (
        f"{len(enabled)}/{expected} enabled node types in the Lab library "
        f"(static parse; sidebarGroups() via node: "
        f"{len(node_types) if node_types is not None else 'skipped, ' + node_note})"
    )
    if problems:
        summary += "; " + "; ".join(problems)
    return Check(
        "nodes.lab_library", 4, _status(not problems), summary,
        {
            "enabled_types": enabled,
            "disabled_types": catalog["disabled_types"],
            "groups": catalog["groups"],
            "sidebar_uses_sidebarGroups": sidebar_uses_catalog,
            "lab_page_renders_sidebar": bool(lab_renders_sidebar),
            "unimplemented": unimplemented,
            "node_sidebarGroups": node_types,
            "node_check": node_note,
        },
    )


def _workflow_nodes(workflow: Any) -> int:
    if isinstance(workflow, str):
        workflow = json.loads(workflow or "{}")
    return len((workflow or {}).get("nodes") or [])


def check_official_templates(
    seed: list[dict[str, Any]], rows: list[dict[str, Any]], expected_enabled: int = EXPECTED_ENABLED_OFFICIAL
) -> Check:
    """``rows``: every templates row with is_official set (id, official_key, workflow, deleted_at)."""
    enabled = [e["official_key"] for e in seed if e.get("enabled", True)]
    disabled = [e["official_key"] for e in seed if not e.get("enabled", True)]
    live = [r for r in rows if r["deleted_at"] is None]
    by_key: dict[str, list[int]] = defaultdict(list)
    for r in live:
        if r["official_key"] is not None:
            by_key[r["official_key"]].append(int(r["id"]))

    missing_keys = sorted(k for k in enabled if k not in by_key)
    duplicate_keys = sorted(k for k, ids in by_key.items() if len(ids) > 1)
    unexpected_keys = sorted(k for k in by_key if k not in enabled)
    empty_workflow_ids = sorted(int(r["id"]) for r in live if _workflow_nodes(r["workflow"]) == 0)
    unkeyed_ids = sorted(int(r["id"]) for r in live if r["official_key"] is None)
    soft_deleted_ids = sorted(int(r["id"]) for r in rows if r["deleted_at"] is not None)

    problems = []
    if len(enabled) != expected_enabled:
        problems.append(f"seed has {len(enabled)} enabled entries, plan expects {expected_enabled}")
    if missing_keys:
        problems.append(f"no live Official row for {missing_keys}")
    if duplicate_keys:
        problems.append(f"more than one live row for {duplicate_keys}")
    if unexpected_keys:
        problems.append(f"live Official rows whose key is not an enabled seed entry {unexpected_keys}")
    if empty_workflow_ids:
        problems.append(f"Official rows without a workflow {empty_workflow_ids}")

    matched = len(enabled) - len(missing_keys)
    summary = (
        f"{matched}/{len(enabled)} enabled seed entries have a live Official row; "
        f"{len(live) - len(empty_workflow_ids)}/{len(live)} live Official rows have a workflow"
    )
    if problems:
        summary += "; " + "; ".join(problems)
    return Check(
        "templates.official_seed", 4, _status(not problems), summary,
        {
            "enabled_seed_keys": enabled,
            "disabled_seed_keys": disabled,
            "live_official_ids": sorted(int(r["id"]) for r in live),
            "missing_keys": missing_keys,
            "duplicate_keys": duplicate_keys,
            "unexpected_keys": unexpected_keys,
            "empty_workflow_ids": empty_workflow_ids,
            "official_rows_without_key": unkeyed_ids,
            "soft_deleted_official_ids": soft_deleted_ids,
        },
    )


def official_rows(conn: Connection) -> list[dict[str, Any]]:
    return [
        dict(r) for r in conn.execute(text(
            "SELECT id, official_key, workflow, deleted_at FROM templates WHERE is_official ORDER BY id"
        )).mappings()
    ]


# --- Runner ----------------------------------------------------------------------------

def pick_admin(conn: Connection) -> int | None:
    return conn.execute(text(
        "SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND provider <> 'system' "
        "ORDER BY id LIMIT 1"
    )).scalar()


def print_report(checks: list[Check]) -> None:
    width = max(len(c.check_id) for c in checks)
    for criterion, title in CRITERIA.items():
        group = [c for c in checks if c.criterion == criterion]
        if not group:
            continue
        print(f"\n[{criterion}] {title}")
        for c in group:
            print(f"  {c.status}  {c.check_id.ljust(width)}  {c.summary}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--database-url", help="defaults to DATABASE_URL from .env")
    parser.add_argument("--snapshot", default=str(DEFAULT_SNAPSHOT), help="T1 snapshot JSON")
    parser.add_argument(
        "--output", default=str(DEFAULT_OUTPUT),
        help=f"machine-readable results, or '-' to skip (default: {DEFAULT_OUTPUT.relative_to(PROJECT_ROOT)})",
    )
    parser.add_argument("--admin-user-id", type=int, help="admin whose session calls the API (default: first active admin)")
    args = parser.parse_args(argv)

    database_url = resolve_database_url(args.database_url)
    # Before anything imports server.*: point its settings at the same database and
    # keep the app from creating tables or seeding on its own.
    os.environ["DATABASE_URL"] = database_url
    os.environ["AUTO_CREATE_TABLES"] = "false"

    snapshot_path = Path(args.snapshot)
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    redacted = make_url(database_url).render_as_string(hide_password=True)
    started = dt.datetime.now(dt.timezone.utc)

    print("VIPER verify_migration (T21)")
    print(f"database: {redacted}")
    print(f"snapshot: {snapshot_path} (captured {snapshot.get('captured_at')}, counts {snapshot.get('counts')})")
    print("reading: one REPEATABLE READ, READ ONLY transaction; the API and SQL see the same rows; rolled back at the end")

    report: dict[str, Any] = {
        "generated_at": started.isoformat(timespec="seconds"),
        "database": redacted,
        "snapshot": {"path": str(snapshot_path), "captured_at": snapshot.get("captured_at"),
                     "snapshot_hash": snapshot.get("snapshot_hash"), "counts": snapshot.get("counts")},
        "criteria": CRITERIA,
    }
    checks: list[Check] = []
    exit_code = 0
    try:
        with readonly_connection(database_url) as conn:
            admin_id = args.admin_user_id or pick_admin(conn)
            if admin_id is None:
                raise IdentityError("no active admin account in the database")
            identity, api_checks = run_api_checks(conn, admin_id)
            report["identity"] = {"id": identity["id"], "role": identity["role"]}
            checks.extend(run_snapshot_checks(conn, snapshot))
            checks.extend(api_checks)
            seed = json.loads(OFFICIAL_SEED.read_text(encoding="utf-8"))
            checks.append(check_official_templates(seed, official_rows(conn)))
            report["current_counts"] = {
                t: conn.execute(text(f'SELECT COUNT(*) FROM "{t}"')).scalar()
                for t in snapshot["tables"] if _IDENTIFIER.match(t)
            }
        checks.append(check_lab_nodes(FRONTEND_DIR))
    except IdentityError as exc:
        print(f"STOP: {exc}")
        report["error"] = str(exc)
        exit_code = 2
    except Exception as exc:  # cannot connect, broken snapshot, ...
        print(f"STOP: {type(exc).__name__}: {exc}")
        report["error"] = f"{type(exc).__name__}: {exc}"
        exit_code = 2

    if checks:
        print_report(checks)
    failed = [c for c in checks if c.status != "PASS"]
    if exit_code == 0:
        exit_code = 1 if failed else 0
    overall = "PASS" if exit_code == 0 else "FAIL"
    report["checks"] = [asdict(c) for c in checks]
    report["result"] = {"overall": overall, "passed": len(checks) - len(failed), "failed": len(failed),
                        "failed_checks": [c.check_id for c in failed]}

    destination = ""
    if args.output != "-":
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
        destination = f" -> {out}"
    print(f"\nRESULT: {overall} ({len(checks) - len(failed)}/{len(checks)} checks passed){destination}")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
