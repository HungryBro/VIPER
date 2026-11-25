"""Playwright checks for the post-checkpoint-3 fixes (R1-R3 + Minor), against a mocked API and a stand-in learningApi module.

Run with the frontend dev server on http://localhost:5173: .venv/bin/python scripts/ui_checks_phase3.py (kept for T23)."""
import json
from playwright.sync_api import sync_playwright
BASE="http://localhost:5173"
def user(role="user", teach=False):
    return {"id":4,"email":"u@example.com","display_name":"U","avatar_url":None,"role":role,"status":"active","banned_until":None,"can_teach":teach}
FAKE = """
const page = (items) => ({ items, next: null });
const course = (id, status) => ({ id, ownerId: '1', ownerName: 'T', code: 'IP101', title: 'Course ' + id, description: 'd', status, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', lessonCount: 0, enrolledCount: 0, enrolled: false, canManage: true });
export async function listCourses() { return page([course('c1', 'published'), course('c2', 'retired')]); }
export async function listManagedCourses() { return page([course('c2', 'retired')]); }
export async function getCourse(id) { return id === 'c2' ? course('c2', 'retired') : null; }
export async function createCourse() { return course('c9', 'draft'); }
export async function updateCourse() { return course('c9', 'draft'); }
export async function setCourseStatus() { return course('c9', 'published'); }
export async function listLessons() { return []; }
export async function createLesson() { return null; }
export async function updateLesson() { return null; }
export async function deleteLesson() {}
export async function moveLesson() { return []; }
export async function getLesson(id) { return id === 'locked' ? { locked: true, lesson: { id, courseId: 'c1', title: 'Locked lesson', subtitle: '' } } : null; }
const sub = { id: 's1', lessonId: 'l1', lessonTitle: 'L1', courseId: 'c1', courseTitle: 'C', learnerId: '9', learnerName: 'Learner', activityVersion: 1, at: '2026-11-01T00:00:00Z', result: { settings: 'k=3', metrics: [91.5, 40], metricLabels: ['Accuracy'] }, autoCheck: null, nodes: [], reflection: '', hints: 0 };
export async function listSubmissions(scope) { return page([{ ...sub, learnerName: scope }]); }
export async function listReviews() { return page([{ submissionId: 's1', score: 70, rubric: [{ label: 'Server rubric', max: 70, score: 70 }], feedback: 'ok', at: '2026-11-01T00:00:00Z', reviewerId: '1', reviewerName: 'T' }]); }
export async function listGrades() { return page([]); }
export async function listAnnouncements() { return page([]); }
export async function listNotifications() { return page([
  { id: 'n1', title: 'Internal', description: 'd', to: '/templates', at: '2026-11-01T00:00:00Z', read: false },
  { id: 'n2', title: 'External', description: 'd', to: '//evil.example/x', at: '2026-11-01T00:00:00Z', read: false },
  { id: 'n3', title: 'Old', description: 'd', to: '/', at: '2026-11-01T00:00:00Z', read: true },
]); }
"""
res=[]
def ok(name, cond, info=""):
    res.append(cond); print(("PASS " if cond else "FAIL ")+name+(f" [{info}]" if info else ""))
with sync_playwright() as p:
    b=p.chromium.launch()
    def page_for(u):
        pg=b.new_page(); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: m.type=="error" and errs.append(m.text))
        pg.route("**/api/**", lambda r, q: r.fulfill(json=u) if q.url.split('?')[0].endswith('/api/auth/me') else r.fulfill(json=[]))
        pg.route("**/src/lib/learningApi.ts*", lambda r, q: r.fulfill(body=FAKE, content_type="application/javascript"))
        return pg, errs
    nav = lambda pg: pg.locator('.global-nav').inner_text().replace('\n',' | ')
    active = lambda pg: pg.locator('.global-nav a.active').all_inner_texts()

    pg, errs = page_for(user("admin"))
    pg.goto(BASE+"/submissions"); pg.wait_for_timeout(800)
    ok("R2 admin nav has Submissions, no My Submissions", "Submissions" in nav(pg) and "My Submissions" not in nav(pg), nav(pg))
    pg.goto(BASE+"/"); pg.wait_for_timeout(600)
    bell = pg.locator('.notification-bell .notification-count')
    ok("R1 bell count badge = 2", bell.count()==1 and bell.inner_text()=="2", bell.inner_text() if bell.count() else "none")
    pg.locator('.notification-bell').click(); pg.wait_for_timeout(200)
    ok("R1 tiny-dot on unread items only", pg.locator('.notification-item .tiny-dot').count()==2)
    ok("R1 unread filter shows count", pg.locator('.notification-toolbar .unread-dot').inner_text()=="2")
    pg.get_by_text("External").click(); pg.wait_for_timeout(300)
    ok("Header external notification not followed", pg.url.rstrip('/')==BASE, pg.url)
    pg.locator('.notification-bell').click(); pg.get_by_text("Internal").click(); pg.wait_for_timeout(400)
    ok("Header internal notification navigates", pg.url.endswith('/templates'), pg.url)
    ok("admin no errors", not errs, str(errs[:2]))

    pg, errs = page_for(user("user", True))
    pg.goto(BASE+"/submissions"); pg.wait_for_timeout(800)
    ok("R3 teacher /submissions = teacher side", pg.locator('h1').first.inner_text()=="Submissions" and 'teaching' in pg.inner_text('main'))
    ok("R3 nav active only Submissions", active(pg)==["Submissions"], str(active(pg)))
    ok("Minor metric label used + fallback", "Accuracy" in pg.inner_text('main') and "ตัวชี้วัด 2" in pg.inner_text('main'))
    ok("Minor rubric from review", "Server rubric (เต็ม 70)" in pg.inner_text('main'))
    pg.goto(BASE+"/submissions?side=mine"); pg.wait_for_timeout(800)
    ok("R3 teacher ?side=mine = learner side", pg.locator('h1').first.inner_text()=="My Submissions" and pg.locator('.submission-card').count()==1, pg.locator('h1').first.inner_text())
    pg.get_by_role("button", name="Grades").click(); pg.wait_for_timeout(300)
    ok("R3 tab switch keeps side=mine", "side=mine" in pg.url and "tab=grades" in pg.url, pg.url)
    pg.goto(BASE+"/teach"); pg.wait_for_timeout(700)
    ok("Minor unknown course status no crash (teach)", "retired" in pg.inner_text('main'))
    pg.goto(BASE+"/courses"); pg.wait_for_timeout(700)
    ok("Minor unknown status no crash (courses)", "Course c2" in pg.inner_text('main'))
    pg.goto(BASE+"/courses/c2"); pg.wait_for_timeout(700)
    ok("Minor unknown status no crash (course page)", "retired" in pg.inner_text('main'))
    pg.goto(BASE+"/lessons/missing"); pg.wait_for_timeout(700)
    ok("Minor getLesson null = ไม่พบบทเรียน", "ไม่พบบทเรียน" in pg.inner_text('main'))
    pg.goto(BASE+"/lessons/locked"); pg.wait_for_timeout(700)
    ok("Minor getLesson locked = ต้องลงทะเบียนก่อน", "ต้องลงทะเบียนก่อนเปิดบทเรียน" in pg.inner_text('main') and "Locked lesson" in pg.inner_text('main'))
    ok("teacher no errors", not errs, str(errs[:2]))

    pg, errs = page_for(user())
    pg.goto(BASE+"/"); pg.wait_for_timeout(600)
    ok("learner nav My Submissions only", "My Submissions" in nav(pg) and nav(pg).count("Submissions")==1, nav(pg))
    pg.get_by_role("link", name="My Submissions").click(); pg.wait_for_timeout(600)
    ok("learner My Submissions link -> side=mine, learner view, active", "side=mine" in pg.url and pg.locator('h1').first.inner_text()=="My Submissions" and active(pg)==["My Submissions"], pg.url+" "+str(active(pg)))
    pg.goto(BASE+"/submissions"); pg.wait_for_timeout(600)
    ok("learner plain /submissions still learner side + active", pg.locator('h1').first.inner_text()=="My Submissions" and active(pg)==["My Submissions"], str(active(pg)))
    ok("learner no errors", not errs, str(errs[:2]))
    b.close()
print(f"{sum(res)}/{len(res)}")
