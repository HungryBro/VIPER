#!/usr/bin/env bash
# ด่านตรวจเดียวของแผนนำ mockup v2 เข้า VIPER (T3)
#
# รัน BE (pytest), FE (lint + build) และเทสต์ frontend แล้วเทียบกับเส้นฐานใน
# tasks/baseline/test-baseline.json บรรทัดสุดท้ายเป็น `CHECK PASS` หรือ
# `CHECK FAIL: <เหตุผล>` และ exit code เป็น 0 หรือ 1 ตามผล
#
# ใช้: scripts/check.sh            (รันจากที่ไหนก็ได้ใน repo)
# log ของแต่ละขั้นเก็บไว้ในโฟลเดอร์ชั่วคราว และพิมพ์ path ไว้ก่อนบรรทัดผล

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FE_DIR="$ROOT/my-react-flow-app"
BASELINE="$ROOT/tasks/baseline/test-baseline.json"
PY="$ROOT/.venv/bin/python"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/viper-check.XXXXXX")"

fail_early() {
  echo "CHECK FAIL: $1"
  exit 1
}

[ -x "$PY" ] || fail_early "ไม่พบ $PY"
[ -f "$BASELINE" ] || fail_early "ไม่พบ $BASELINE"
[ -d "$FE_DIR/node_modules" ] || fail_early "ไม่พบ my-react-flow-app/node_modules (รัน npm install ก่อน)"

echo "[check] log: $LOG_DIR"

echo "[check] BE: pytest"
(cd "$ROOT" && "$PY" -m pytest --ignore=tests/compare_yolo -q --tb=short -p no:cacheprovider \
  --junitxml="$LOG_DIR/pytest.xml" >"$LOG_DIR/pytest.log" 2>&1)
echo "$?" >"$LOG_DIR/pytest.exit"

echo "[check] FE: lint"
(cd "$FE_DIR" && npx --no-install eslint . --format json --output-file "$LOG_DIR/eslint.json" \
  >"$LOG_DIR/eslint.log" 2>&1)
echo "$?" >"$LOG_DIR/eslint.exit"

echo "[check] FE: build"
(cd "$FE_DIR" && npm run build >"$LOG_DIR/build.log" 2>&1)
echo "$?" >"$LOG_DIR/build.exit"

echo "[check] FE: node --test"
NODE_TEST_FILES="$("$PY" -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1]))["frontend"]["node_tests"]["files"]))' "$BASELINE")"
# shellcheck disable=SC2086
(cd "$FE_DIR" && node --test --test-reporter=tap $NODE_TEST_FILES >"$LOG_DIR/node-test.log" 2>&1)
echo "$?" >"$LOG_DIR/node-test.exit"

EVAL_OUT="$LOG_DIR/evaluate.log"
"$PY" - "$BASELINE" "$LOG_DIR" >"$EVAL_OUT" 2>&1 <<'PY'
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

baseline = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
log = Path(sys.argv[2])
reasons: list[str] = []


def exit_code(name: str) -> int:
    return int((log / f"{name}.exit").read_text().strip())


# ---- BE: pytest -----------------------------------------------------------
be = baseline["backend"]
junit = log / "pytest.xml"
if not junit.exists():
    reasons.append(f"pytest ไม่ได้สร้างผล (exit {exit_code('pytest')}) ดู pytest.log")
else:
    passed = 0
    failing: set[str] = set()
    skipped = 0
    for case in ET.parse(junit).getroot().iter("testcase"):
        test_id = f"{case.get('classname')}::{case.get('name')}"
        if case.find("failure") is not None or case.find("error") is not None:
            failing.add(test_id)
        elif case.find("skipped") is not None:
            skipped += 1
        else:
            passed += 1
    # error ตอนเก็บเทสต์ (collection) ถูกเขียนเป็น testcase ที่มี <error> จึงนับรวมใน failing
    # exit code 2–5 คือหยุดกลางทาง, internal error, ใช้ผิด หรือไม่พบเทสต์
    pytest_exit = exit_code("pytest")
    if pytest_exit not in (0, 1):
        reasons.append(f"pytest จบผิดปกติ (exit {pytest_exit}) ดู pytest.log")
    allowed = set(be["allowed_failures"])
    new_failures = sorted(failing - allowed)
    print(f"[check] BE: ผ่าน {passed}, ล้ม {len(failing)}, ข้าม {skipped} "
          f"(เส้นฐาน: ผ่าน >= {be['min_passed']}, ล้ม <= {be['max_failed']})")
    if passed < be["min_passed"]:
        reasons.append(f"pytest ผ่าน {passed} น้อยกว่าเส้นฐาน {be['min_passed']}")
    if len(failing) > be["max_failed"]:
        reasons.append(f"pytest ล้ม {len(failing)} มากกว่าเส้นฐาน {be['max_failed']}")
    if new_failures:
        shown = ", ".join(new_failures[:5]) + (" ..." if len(new_failures) > 5 else "")
        reasons.append(f"pytest ล้มนอกชุดเดิม {len(new_failures)} รายการ: {shown}")

# ---- FE: lint -------------------------------------------------------------
fe = baseline["frontend"]
eslint_json = log / "eslint.json"
if not eslint_json.exists():
    reasons.append(f"eslint ไม่ได้สร้างผล (exit {exit_code('eslint')}) ดู eslint.log")
else:
    files = json.loads(eslint_json.read_text(encoding="utf-8") or "[]")
    errors = sum(f["errorCount"] + f.get("fatalErrorCount", 0) for f in files)
    warnings = sum(f["warningCount"] for f in files)
    print(f"[check] FE lint: error {errors}, warning {warnings} "
          f"(เส้นฐาน: error <= {fe['lint_max_errors']}, warning เดิม {fe['lint_warnings_at_baseline']})")
    if errors > fe["lint_max_errors"]:
        where = [
            f"{Path(f['filePath']).name}:{m['line']} {m.get('ruleId')}"
            for f in files for m in f["messages"] if m["severity"] == 2
        ]
        reasons.append(f"lint มี error {errors}: {', '.join(where[:5])}")

# ---- FE: build ------------------------------------------------------------
build_exit = exit_code("build")
print(f"[check] FE build: exit {build_exit}")
if build_exit != 0:
    reasons.append("npm run build ไม่ผ่าน ดู build.log")

# ---- FE: node --test ------------------------------------------------------
nt = fe["node_tests"]
nt_exit = exit_code("node-test")
tap = (log / "node-test.log").read_text(encoding="utf-8", errors="replace")
m_pass = re.search(r"^# pass (\d+)", tap, re.M)
m_fail = re.search(r"^# fail (\d+)", tap, re.M)
nt_pass = int(m_pass.group(1)) if m_pass else 0
nt_fail = int(m_fail.group(1)) if m_fail else -1
print(f"[check] FE node --test: ผ่าน {nt_pass}, ล้ม {nt_fail}, exit {nt_exit} "
      f"(เส้นฐาน: ผ่าน >= {nt['min_passed']}, ล้ม 0)")
if nt_exit != 0 or nt_fail != 0:
    reasons.append(f"node --test ล้ม (ล้ม {nt_fail}, exit {nt_exit}) ดู node-test.log")
elif nt_pass < nt["min_passed"]:
    reasons.append(f"node --test ผ่าน {nt_pass} น้อยกว่าเส้นฐาน {nt['min_passed']}")

print(f"[check] log: {log}")
if reasons:
    print("CHECK FAIL: " + "; ".join(reasons))
    sys.exit(1)
print("CHECK PASS")
PY
EVAL_STATUS=$?

# ตัวประเมินผลพังเอง (เช่น traceback) ต้องไม่หลุดเป็นผลอื่นที่ไม่ใช่ CHECK
if [ "$EVAL_STATUS" -eq 0 ] && [ "$(tail -n 1 "$EVAL_OUT")" = "CHECK PASS" ]; then
  cat "$EVAL_OUT"
  exit 0
fi
if [ "$EVAL_STATUS" -eq 1 ] && tail -n 1 "$EVAL_OUT" | grep -q '^CHECK FAIL: '; then
  cat "$EVAL_OUT"
  exit 1
fi
cat "$EVAL_OUT"
echo "CHECK FAIL: ตัวประเมินผลทำงานผิดพลาด (exit $EVAL_STATUS) ดู $EVAL_OUT"
exit 1
