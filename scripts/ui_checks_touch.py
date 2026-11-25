"""Touch checks for the Lab canvas and library, driven with real touch events (CDP Input.dispatchTouchEvent), no mouse.

Run with the frontend dev server on http://localhost:5173 and the API mocked as in ui_checks.py:
    .venv/bin/python scripts/ui_checks_touch.py
Covers: one-finger pan, pinch zoom, dragging a node, tap-to-add (phone), long-press drag from the library (tablet),
swipe to scroll the library, release outside the canvas, and the mouse behaviour on a desktop screen."""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ui_checks as u  # noqa: E402  (shares the API mock and the Lab test workflow)
from playwright.sync_api import sync_playwright  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def new_page(browser, w, h, touch=True):
    ctx = browser.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch, device_scale_factor=2 if touch else 1)
    ctx.add_init_script("try{localStorage.setItem('n2n_app_tabs'," + json.dumps(json.dumps(u.LAB_TABS)) +
                        ");localStorage.setItem('n2n_active_tab_id','tab-1')}catch(e){}")
    page = ctx.new_page()
    page.route("**/api/**", u.Api().handle)
    page.goto(u.BASE + "/lab")
    page.wait_for_selector(".react-flow__node")
    page.wait_for_timeout(1500)
    return ctx, page


def touch(cdp, kind, points):
    cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(points)]})


def swipe(cdp, page, x, y, dx, dy, steps=12, hold_ms=0, end=True):
    touch(cdp, "touchStart", [(x, y)])
    if hold_ms:
        page.wait_for_timeout(hold_ms)
    for i in range(1, steps + 1):
        touch(cdp, "touchMove", [(x + dx * i / steps, y + dy * i / steps)])
        page.wait_for_timeout(15)
    if end:
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


def viewport(page):
    m = [float(v) for v in re.findall(r"-?[\d.]+", page.evaluate("getComputedStyle(document.querySelector('.react-flow__viewport')).transform"))]
    return m[4], m[5], m[0]


def node_count(page):
    return page.locator(".react-flow__node").count()


def clear_canvas(page):
    page.evaluate("[...document.querySelectorAll('.viper-canvas-actions button')].at(-1).click()")
    page.wait_for_timeout(300)


def open_library(page):
    if page.evaluate("!!document.querySelector('button[aria-label=\"Open library\"]')"):
        page.evaluate("document.querySelector('button[aria-label=\"Open library\"]').click()")
        page.wait_for_timeout(400)
    page.evaluate("[...document.querySelectorAll('.viper-sidebar button')].find(b=>b.textContent.trim()==='Open all')?.click()")
    page.wait_for_timeout(300)


def empty_pane_point(page, margin=48):
    """A point on the bare canvas at least `margin` px from any node (a finger near a node edge grabs the node)."""
    return page.evaluate("""(margin)=>{const nodes=[...document.querySelectorAll('.react-flow__node')].map(n=>n.getBoundingClientRect());const pts=[];
        for(let y=Math.round(innerHeight*.35);y<innerHeight-120;y+=15)for(let x=Math.round(innerWidth*.35);x<innerWidth-30;x+=15){
        const e=document.elementFromPoint(x,y);if(!(e&&e.classList.contains('react-flow__pane')))continue;
        if(nodes.some(r=>x>r.left-margin&&x<r.right+margin&&y>r.top-margin&&y<r.bottom+margin))continue;pts.push([x,y])}return pts[Math.floor(pts.length/2)]}""", margin)


def center(page, selector_js):
    return page.evaluate(f"(()=>{{const r=({selector_js}).getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}})()")


SIFT_BTN = "[...document.querySelectorAll('.viper-sidebar button[aria-label]')].find(b=>b.getAttribute('aria-label').includes('SIFT'))"


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---- phone 375x812 ----
        ctx, page = new_page(browser, 375, 812)
        cdp = ctx.new_cdp_session(page)
        page.wait_for_timeout(800)  # let the first fit settle: a drag that starts on a node moves the node, not the canvas
        x, y = empty_pane_point(page)
        before = viewport(page)
        swipe(cdp, page, x, y, -90, -110)
        page.wait_for_timeout(300)
        after = viewport(page)
        check("phone: one finger on empty canvas pans it", abs(after[0] - before[0] - (-90)) < 6 and abs(after[1] - before[1] - (-110)) < 6, f"{before[:2]} -> {after[:2]}")
        before = viewport(page)
        cx, cy = empty_pane_point(page, 130)
        touch(cdp, "touchStart", [(cx - 40, cy), (cx + 40, cy)])
        for i in range(1, 9):
            touch(cdp, "touchMove", [(cx - 40 - 6 * i, cy), (cx + 40 + 6 * i, cy)])
            page.wait_for_timeout(15)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_timeout(300)
        check("phone: pinch zooms", viewport(page)[2] > before[2] * 1.2, f"{before[2]:.2f} -> {viewport(page)[2]:.2f}")
        page.evaluate("document.querySelector('.viper-canvas-actions button').click()")  # Fit
        page.wait_for_timeout(500)
        nx, ny = center(page, "document.querySelector('.react-flow__node .nh, .react-flow__node [class*=bg-gray-700]')")
        pos0 = page.evaluate("document.querySelector('.react-flow__node').style.transform")
        swipe(cdp, page, nx - 30, ny, 0, 60)
        page.wait_for_timeout(300)
        check("phone: dragging a node moves the node, not the canvas", page.evaluate("document.querySelector('.react-flow__node').style.transform") != pos0)
        clear_canvas(page)
        open_library(page)
        n0 = node_count(page)
        bx, by = center(page, SIFT_BTN)
        touch(cdp, "touchStart", [(bx, by)])
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_timeout(1500)
        info = page.evaluate("""(()=>{const pane=document.querySelector('.react-flow').getBoundingClientRect();const r=document.querySelector('.react-flow__node').getBoundingClientRect();
            return {inPane:r.left>=pane.left-1&&r.right<=pane.right+1&&r.top>=pane.top-1&&r.bottom<=pane.bottom+1,sidebarW:document.querySelector('.viper-sidebar').getBoundingClientRect().width,
            plus:[...document.querySelectorAll('.viper-sidebar button')].filter(b=>b.textContent.trim()==='+').length}})()""")
        check("phone: tapping a library button adds the node, drawer folds, no + button", node_count(page) == n0 + 1 and info["sidebarW"] < 80 and info["plus"] == 0 and info["inPane"], str(info))
        ctx.close()

        # ---- tablets ----
        for w, h in ((1024, 768), (768, 1024)):
            ctx, page = new_page(browser, w, h)
            cdp = ctx.new_cdp_session(page)
            tag = f"tablet {w}x{h}"
            clear_canvas(page)
            open_library(page)
            bx, by = center(page, SIFT_BTN)
            px, py = empty_pane_point(page)
            n0 = node_count(page)
            tr = viewport(page)
            pane = page.evaluate("(()=>{const r=document.querySelector('.react-flow').getBoundingClientRect();return [r.left,r.top]})()")
            swipe(cdp, page, bx, by, px - bx, py - by, steps=14, hold_ms=350, end=False)
            ghost = page.evaluate("!!document.querySelector('[aria-hidden=true].pointer-events-none.fixed')")
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            page.wait_for_timeout(800)
            m = re.findall(r"-?[\d.]+", page.evaluate("document.querySelector('.react-flow__node').style.transform"))
            exp = ((px - pane[0] - tr[0]) / tr[2], (py - pane[1] - tr[1]) / tr[2])
            check(f"{tag}: long-press drag shows a ghost and drops the node under the finger", ghost and node_count(page) == n0 + 1 and abs(float(m[0]) - exp[0]) < 4 and abs(float(m[1]) - exp[1]) < 4, f"ghost={ghost} node={m[:2]} expected={[round(v) for v in exp]}")
            n1b = node_count(page)
            swipe(cdp, page, bx, by, px - bx, py - by, steps=14, hold_ms=0)  # no press: a sideways drag picks the node up straight away
            page.wait_for_timeout(800)
            check(f"{tag}: an immediate sideways drag (no long press) also drops a node on the canvas", node_count(page) == n1b + 1)
            n1 = node_count(page)
            touch(cdp, "touchStart", [(bx, by)])
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            page.wait_for_timeout(1200)
            check(f"{tag}: a short tap adds a node", node_count(page) == n1 + 1)
            n2 = node_count(page)
            st0 = page.evaluate("document.querySelector('.viper-sidebar .overflow-y-auto').scrollTop")
            swipe(cdp, page, bx, by + 120, 0, -90)
            page.wait_for_timeout(300)
            st1 = page.evaluate("document.querySelector('.viper-sidebar .overflow-y-auto').scrollTop")
            check(f"{tag}: swiping the library scrolls it and adds nothing", st1 > st0 and node_count(page) == n2, f"scrollTop {st0} -> {st1}")
            swipe(cdp, page, bx, by - 0, 0, 0, steps=1, hold_ms=350, end=False)  # pick up, then lift over the library itself
            touch(cdp, "touchMove", [(bx + 5, by + 40)])
            page.wait_for_timeout(100)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            page.wait_for_timeout(600)
            check(f"{tag}: releasing outside the canvas adds nothing", node_count(page) == n2)
            px2, py2 = empty_pane_point(page)
            before = viewport(page)
            swipe(cdp, page, px2, py2, -80, -60)
            page.wait_for_timeout(300)
            check(f"{tag}: one finger pans the canvas", viewport(page)[:2] != before[:2], f"{before[:2]} -> {viewport(page)[:2]}")
            ctx.close()

        # ---- desktop, mouse ----
        ctx, page = new_page(browser, 1440, 900, touch=False)
        clear_canvas(page)
        open_library(page)
        btn = page.get_by_role("button", name=re.compile("SIFT"))
        btn.click()
        page.wait_for_timeout(500)
        check("desktop mouse: a plain click does not add a node and keeps the library open", node_count(page) == 0 and page.evaluate("document.querySelector('.viper-sidebar').getBoundingClientRect().width") > 200)
        btn.drag_to(page.locator(".react-flow__pane"), target_position={"x": 600, "y": 250})
        page.wait_for_timeout(700)
        check("desktop mouse: dragging a library button onto the canvas adds a node", node_count(page) == 1)
        before = viewport(page)
        page.mouse.move(900, 600)
        page.mouse.down()
        page.mouse.move(800, 540, steps=8)
        page.mouse.up()
        check("desktop mouse: dragging empty canvas pans it", viewport(page)[:2] != before[:2])
        ctx.close()
        browser.close()
    print(f"\n{sum(results)}/{len(results)} passed")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    run()
