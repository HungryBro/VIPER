"""Playwright checks for the post-checkpoint-2 UI fixes (A1-A4f, B5, B7b), against a mocked API (no real DB writes).

Run with the frontend dev server on http://localhost:5173: .venv/bin/python scripts/ui_checks.py
Kept for T23 to rerun."""
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
NOW = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)
ADMIN = {"id": 2, "email": "admin@example.com", "display_name": "Admin", "avatar_url": None, "role": "admin",
         "status": "active", "banned_until": None, "can_teach": False}
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def iso(minutes=0):
    return (NOW - timedelta(minutes=minutes)).isoformat()


def log_row(i, action="auth.login"):
    return {"id": i, "actor_id": 2, "actor": {"id": 2, "display_name": "Admin", "email": "admin@example.com"},
            "action": action, "target_type": "user", "target_id": "2", "details": {}, "request_path": f"/api/p/{i}",
            "status_code": 200, "created_at": iso(i)}


def me_row(i):
    return {"id": i, "action": "auth.login", "target_type": "user", "target_id": "2", "details": {},
            "request_path": "/x", "status_code": 200, "created_at": iso(i)}


def owner():
    return {"id": 1, "display_name": "VIPER Official", "avatar_url": None}


def template(i, name, official=True, visibility="public"):
    return {"id": i, "owner_id": 1, "owner": owner(), "name": name, "description": "", "visibility": visibility,
            "cover_url": None, "comments_enabled": True, "is_official": official, "official_key": None,
            "created_at": iso(), "updated_at": iso()}


USERS = [
    {**ADMIN, "provider": "google", "last_login_at": iso(), "created_at": iso(9999)},
    {"id": 1, "email": "official-templates@viper.local", "display_name": "VIPER Official", "avatar_url": None,
     "role": "user", "status": "active", "banned_until": None, "can_teach": False, "provider": "system",
     "last_login_at": None, "created_at": iso(9999)},
    {"id": 3, "email": "learner@example.com", "display_name": "Learner", "avatar_url": None, "role": "user",
     "status": "active", "banned_until": None, "can_teach": False, "provider": "google", "last_login_at": iso(),
     "created_at": iso(9999)},
]


class Api:
    def __init__(self):
        self.calls = []
        self.drop_total_header = False
        self.templates = [template(10, "SIFT"), template(11, "ORB")]
        self.private = []

    def handle(self, route, request):
        url = urlparse(request.url)
        path, q = url.path, parse_qs(url.query)
        self.calls.append((request.method, path, url.query, request.post_data))

        def send(body, status=200, headers=None):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(body), headers=headers or {})

        if path == "/api/auth/me":
            return send(ADMIN)
        if path == "/api/auth/logout":
            return send({"ok": True})
        if path == "/api/admin/audit-logs/actions":
            return send([{"action": "auth.login", "count": 300}, {"action": "template.create", "count": 10}])
        if path == "/api/admin/audit-logs":
            offset = int(q.get("offset", ["0"])[0])
            limit = int(q.get("limit", ["100"])[0])
            action = q.get("action", [None])[0]
            if action == "template.create":
                rows = [log_row(5000 + i, "template.create") for i in range(5)] if offset == 0 else []
                return send(rows, headers={"X-Total-Count": "10"})
            if offset > 0:
                time.sleep(2.0)  # slow "load more"
            rows = [log_row(offset + i + 1) for i in range(limit)]
            headers = {} if self.drop_total_header else {"X-Total-Count": "300"}
            return send(rows, headers=headers)
        if path == "/api/admin/users":
            return send(USERS)
        if path.startswith("/api/admin/users/") and request.method == "PATCH":
            body = json.loads(request.post_data or "{}")
            user = next(u for u in USERS if u["id"] == int(path.rsplit("/", 1)[1]))
            return send({**user, **body})
        if path == "/api/me/summary":
            return send({"template_count": 0, "public_template_count": 0, "run_count": 0, "activity_count": 120,
                         "last_run_at": None, "last_activity_at": iso(), "last_login_at": iso(),
                         "member_since": iso(9999)})
        if path == "/api/me/activity":
            offset = int(q.get("offset", ["0"])[0])
            # page 2 overlaps page 1 by 10 rows (new logs arrived between the clicks)
            ids = range(1, 51) if offset == 0 else range(41, 91)
            return send([me_row(i) for i in ids], headers={"X-Total-Count": "120"})
        if path == "/api/templates/official":
            return send(self.templates)
        if path == "/api/templates/mine":
            return send(self.private)
        if path == "/api/templates" and request.method == "GET":
            return send([])
        if path == "/api/templates" and request.method == "POST":
            body = json.loads(request.post_data or "{}")
            created = template(99, body.get("name", "x"), official=False, visibility=body.get("visibility", "private"))
            self.private.append(created)
            return send({**created, "workflow": body.get("workflow")}, status=201)
        if path.startswith("/api/templates/") and request.method == "PATCH":
            return send({**self.templates[0], "workflow": {"version": 1, "nodes": [], "edges": []}})
        if path.startswith("/api/templates/") and path.endswith("/comments"):
            return send([])
        return send({"detail": f"unmocked {path}"}, status=404)


LAB_TABS = [{"id": "tab-1", "name": "Workflow 1", "viewport": {"x": 0, "y": 0, "zoom": 1}, "edges": [],
             "nodes": [{"id": "n1", "type": "sift", "position": {"x": 200, "y": 150},
                        "data": {"label": "SIFT", "status": "idle"}}]}]


def new_page(browser, api, **context_options):
    context = browser.new_context(viewport={"width": 1440, "height": 900}, **context_options)
    context.add_init_script(
        "try{localStorage.setItem('n2n_app_tabs'," + json.dumps(json.dumps(LAB_TABS)) +
        ");localStorage.setItem('n2n_active_tab_id','tab-1')}catch(e){}"
    )
    page = context.new_page()
    page.route("**/api/**", api.handle)
    console = []
    page.on("console", lambda message: console.append(message.text))
    return context, page, console


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---- A2 + A4a: Logs ----
        api = Api()
        ctx, page, _ = new_page(browser, api)
        page.goto(f"{BASE}/logs")
        page.wait_for_selector("tr[data-log-id]")
        page.get_by_role("button", name="โหลดเพิ่ม").click()
        page.wait_for_timeout(200)
        page.get_by_label("กรองประเภทเหตุการณ์").select_option("template.create")
        page.wait_for_timeout(3000)
        button = page.get_by_role("button", name="โหลดเพิ่ม")
        actions = page.eval_on_selector_all("tr[data-log-id]", "rows => rows.map(r => r.innerText)")
        check("A2 load-more button usable after filter change", button.count() == 1 and button.is_enabled(),
              f"count={button.count()}")
        check("A2 only rows of the new filter", len(actions) == 5 and all("template.create" in a for a in actions),
              f"rows={len(actions)}")
        ctx.close()

        api = Api()
        api.drop_total_header = True
        ctx, page, _ = new_page(browser, api)
        page.goto(f"{BASE}/logs")
        page.wait_for_selector("tr[data-log-id]")
        total = page.get_by_test_id("log-total").inner_text()
        more = page.get_by_role("button", name="โหลดเพิ่ม").count()
        first = page.get_by_text("ถึงเหตุการณ์แรกสุดแล้ว").count()
        check("A4a Logs without X-Total-Count: total not 0, load-more shown", total != "0" and more == 1 and first == 0,
              f"total={total}")
        ctx.close()

        # ---- A4c: Profile duplicate rows ----
        api = Api()
        ctx, page, console = new_page(browser, api)
        page.goto(f"{BASE}/profile")
        page.get_by_role("tab", name="ประวัติ").or_(page.get_by_role("button", name="ประวัติ")).first.click()
        page.wait_for_selector(".profile-event-list > div")
        page.get_by_role("button", name="โหลดเพิ่ม").click()
        page.wait_for_timeout(800)
        rows = page.locator(".profile-event-list > div").count()
        dup_warnings = [m for m in console if "same key" in m]
        check("A4c Profile rows = unique ids (90)", rows == 90, f"rows={rows}")
        check("A4c no duplicate key warning", not dup_warnings, str(dup_warnings[:1]))
        ctx.close()

        # ---- B5 + A4b: Users ----
        api = Api()
        ctx, page, _ = new_page(browser, api)
        page.clock.install(time=NOW.timestamp())
        page.goto(f"{BASE}/users")
        page.wait_for_selector("tr[data-user-id='1']")
        system_row = page.locator("tr[data-user-id='1']")
        badge = system_row.get_by_text("บัญชีระบบ").count()
        controls = system_row.locator("select, button")
        disabled = [controls.nth(i).is_disabled() for i in range(controls.count())]
        check("B5 system account row shows badge", badge == 1)
        check("B5 every control on system row disabled", disabled and all(disabled), str(disabled))
        page.get_by_label("แบน learner@example.com").select_option("BAN 1M")
        page.clock.fast_forward(90_000)
        with page.expect_request(lambda r: r.method == "PATCH") as patch:
            page.get_by_role("button", name="ยืนยัน").click()
        body = json.loads(patch.value.post_data)
        clicked_at = page.evaluate("Date.now()")
        until = datetime.fromisoformat(body["banned_until"].replace("Z", "+00:00")).timestamp() * 1000
        check("A4b banned_until = confirm time + 1 min", abs(until - (clicked_at + 60_000)) < 5_000,
              f"diff_ms={until - (clicked_at + 60_000):.0f}")
        page.goto(f"{BASE}/")
        page.wait_for_timeout(1500)
        stat = page.locator(".stat", has_text="ผู้ใช้ที่เปิดใช้งาน").inner_text() if page.locator(".stat", has_text="ผู้ใช้ที่เปิดใช้งาน").count() else page.get_by_text("ผู้ใช้ที่เปิดใช้งาน").locator("..").inner_text()
        check("B5 admin dashboard active users excludes system (2)", "2" in stat and "3" not in stat, stat.replace("\n", " "))
        ctx.close()

        # ---- A1 + A4e + A4f + A4d: Lab ----
        api = Api()
        ctx, page, _ = new_page(browser, api)
        page.goto(f"{BASE}/lab")
        page.wait_for_selector(".react-flow__node")
        node = page.locator(".react-flow__node").first
        node.click()
        page.get_by_role("button", name="SAVE TEMPLATE").click()
        page.wait_for_selector("[aria-modal='true']")
        for key in ("Backspace", "Delete", "Control+z", "Meta+z", "Control+v"):
            page.keyboard.press(key)
        page.wait_for_timeout(200)
        during = page.locator(".react-flow__node").count()
        name_input = page.locator("[aria-modal='true'] input").first
        name_input.fill("Typed name")
        name_input.press("Backspace")
        typed = name_input.input_value()
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        if page.locator("[aria-modal='true']").count():
            page.locator("[aria-modal='true']").get_by_role("button", name="ยกเลิก").click()
        page.locator(".react-flow__node").first.click()
        page.keyboard.press("Delete")
        page.wait_for_timeout(200)
        after = page.locator(".react-flow__node").count()
        check("A1 hotkeys ignored while SAVE TEMPLATE open", during == 1, f"nodes={during}")
        check("A1 typing in the dialog still works", typed == "Typed nam", typed)
        check("A1 Delete works again after closing", after == 0, f"nodes={after}")
        page.keyboard.press("Control+z")
        page.keyboard.press("Meta+z")
        page.wait_for_timeout(300)
        page.get_by_role("button", name="วิธีใช้ VIPER Lab").click()
        page.wait_for_selector("[aria-modal='true']")
        page.locator(".react-flow__node").first.click(force=True) if page.locator(".react-flow__node").count() else None
        page.keyboard.press("Delete")
        page.wait_for_timeout(200)
        during_help = page.locator(".react-flow__node").count()
        check("A1 hotkeys ignored while help open", during_help >= 1, f"nodes={during_help}")
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        ctx.close()

        # A4e + A4f
        api = Api()
        ctx, page, _ = new_page(browser, api)
        page.goto(f"{BASE}/lab")
        page.wait_for_selector(".react-flow__node")
        page.get_by_role("button", name="Templates", exact=False).first.click()
        page.wait_for_timeout(800)
        official_gets = lambda: sum(1 for c in api.calls if c[0] == "GET" and c[1] == "/api/templates/official")
        before_save = official_gets()
        page.get_by_role("button", name="SAVE TEMPLATE").click()
        dialog = page.locator("[aria-modal='true']")
        dialog.locator("input").first.fill("From Lab")
        dialog.get_by_role("button", name="บันทึก").last.click()
        page.wait_for_timeout(800)
        check("A4f library list reloads after SAVE TEMPLATE", official_gets() > before_save,
              f"{before_save}->{official_gets()}")
        if page.locator("[aria-modal='true']").count():
            page.keyboard.press("Escape")
            page.wait_for_timeout(200)
        if page.locator("[aria-modal='true']").count():
            page.locator("[aria-modal='true']").get_by_role("button").first.click()
        before_nav = official_gets()
        page.evaluate("window.history.pushState({}, '', '/templates'); dispatchEvent(new PopStateEvent('popstate'))")
        page.wait_for_timeout(800)
        page.evaluate("window.history.pushState({}, '', '/lab'); dispatchEvent(new PopStateEvent('popstate'))")
        page.wait_for_timeout(1000)
        check("A4f library list reloads when returning to /lab", official_gets() > before_nav,
              f"{before_nav}->{official_gets()}")

        settings = page.get_by_role("button", name="Template settings").first
        patches = lambda: sum(1 for c in api.calls if c[0] == "PATCH" and c[1].startswith("/api/templates/"))
        page.once("dialog", lambda d: d.dismiss())
        settings.click()
        page.get_by_role("button", name="UPDATE CANVAS").first.click()
        page.wait_for_timeout(500)
        cancelled = patches()
        page.once("dialog", lambda d: d.accept())
        settings.click()
        page.get_by_role("button", name="UPDATE CANVAS").first.click()
        page.wait_for_timeout(800)
        check("A4e Official UPDATE CANVAS: cancel sends 0 PATCH, confirm sends 1", cancelled == 0 and patches() == 1,
              f"cancel={cancelled} confirm={patches()}")

        # A4d: a pending template is dropped on logout
        page.evaluate("window.history.pushState({}, '', '/templates'); dispatchEvent(new PopStateEvent('popstate'))")
        page.wait_for_timeout(500)
        pending_before = page.evaluate("""async () => {
            const m = await import('/src/platform/labBridge.ts');
            m.labBridge.push({id: 10, name: 'SIFT', workflow: {version: 1, nodes: [], edges: []}});
            return m.labBridge.peek() !== null;
        }""")
        page.get_by_label("เมนูบัญชี").locator("visible=true").first.click()
        page.get_by_text("ออกจากระบบ").locator("visible=true").first.click()
        page.wait_for_timeout(800)
        pending_after = page.evaluate("async () => (await import('/src/platform/labBridge.ts')).labBridge.peek()")
        check("A4d labBridge cleared on logout", pending_before and pending_after is None, str(pending_after))
        ctx.close()

        # ---- B7b: phone landscape ----
        def lab_metrics(width, height, touch):
            api = Api()
            options = {"viewport": {"width": width, "height": height}}
            if touch:
                options.update(has_touch=True, is_mobile=True)
            context = browser.new_context(**options)
            context.add_init_script(
                "try{localStorage.setItem('n2n_app_tabs'," + json.dumps(json.dumps(LAB_TABS)) +
                ");localStorage.setItem('n2n_active_tab_id','tab-1')}catch(e){}"
            )
            pg = context.new_page()
            pg.route("**/api/**", api.handle)
            pg.goto(f"{BASE}/lab")
            pg.wait_for_selector(".viper-app")
            pg.wait_for_timeout(500)
            metrics = pg.evaluate("""() => ({
                editor: document.querySelector('.viper-app').getBoundingClientRect().height,
                header: document.querySelector('.viper-lab-platform-header').getBoundingClientRect().height,
                overflow: document.documentElement.scrollWidth > window.innerWidth,
            })""")
            return context, pg, metrics

        ctx, page, m = lab_metrics(844, 390, True)
        menu = page.get_by_role("button", name="เมนูแพลตฟอร์ม (บัญชี หน้าอื่น ออกจากระบบ)")
        has_menu = menu.count() == 1
        check("B7b 844x390 touch: platform header hidden, editor taller", m["header"] == 0 and m["editor"] > 300,
              json.dumps(m))
        if has_menu:
            menu.click()
            page.wait_for_timeout(200)
            page.get_by_label("เมนูบัญชี").locator("visible=true").first.click()
            logout_visible = page.get_by_text("ออกจากระบบ").locator("visible=true").count() > 0
        else:
            logout_visible = False
        check("B7b menu button reveals account menu with log out", has_menu and logout_visible)
        ctx.close()
        for size in ((1440, 900, False), (375, 812, True)):
            ctx, page, m = lab_metrics(*size)
            check(f"B7b {size[0]}x{size[1]} header still shown, no menu button, no overflow",
                  m["header"] > 0 and not m["overflow"] and page.get_by_role("button", name="เมนูแพลตฟอร์ม (บัญชี หน้าอื่น ออกจากระบบ)").count() == 0,
                  json.dumps(m))
            ctx.close()

        browser.close()
    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    run()
