#!/usr/bin/env python3
"""ถ่ายภาพหน้าจอเพื่อเทียบ mockup v2 กับ VIPER จริง (ชั้นที่ 3 ของ tasks/plan.md)

รอบ T2 ทำเฉพาะ --target mockup; T22 จะเพิ่ม --target real (พอร์ต 5173) โดยใช้
รายการแถวชุดเดียวกัน (ROWS ด้านล่าง ซึ่งต้องตรงกับ tasks/parity.md ส่วนที่ 1)

รัน (จากโฟลเดอร์หลัก VIPER):
    ./.venv/bin/python scripts/parity_screenshots.py                  # ถ่ายทุกแถว
    ./.venv/bin/python scripts/parity_screenshots.py --rows P-01,C-04 # เฉพาะบางแถว
    ./.venv/bin/python scripts/parity_screenshots.py --check          # ตรวจว่าแถวตรงกับ parity.md (ไม่ถ่าย)
    ./.venv/bin/python scripts/parity_screenshots.py --list

ผลลัพธ์: outputs/parity-report/<target>/<แถว>__<บทบาท>__<กว้าง>.png และ manifest.json
บทบาทในชื่อไฟล์: guest = ผู้เยี่ยมชม (ไม่ login), learner = ผู้เรียน, instructor = ผู้สอน, admin = ผู้ดูแล

หลักการ: ทุกภาพใช้ browser context ใหม่ (localStorage ว่าง) เพื่อให้ถ่ายซ้ำได้ ไม่แก้ source ของ mockup
mockup ไม่มี URL routing จึงเปลี่ยนหน้าด้วยการเรียก go()/login() ผ่าน React context
(อ่านจาก fiber ของ #root) ส่วน modal/เมนู/กระดิ่งเปิดด้วยการคลิกจริง
"""
from __future__ import annotations

import argparse
import json
import re
import socket
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

REPO = Path(__file__).resolve().parent.parent
PARITY_MD = REPO / 'tasks' / 'parity.md'
MOCKUP_DIR = REPO / 'outputs' / 'viper-learning-v2'
OUT_ROOT = REPO / 'outputs' / 'parity-report'

TARGETS = {
    'mockup': {'port': 8765, 'path': '/index.html'},
    'real': {'port': 5173, 'path': '/'},  # T22: ต้องมี session login จริงใน outputs/parity-report/sessions/
}

SIZES = {1440: 900, 375: 812}
ROLE_ACCOUNT = {'learner': 'learner', 'instructor': 'instructor', 'admin': 'admin'}
ROLE_LABEL = {'guest': 'ผู้เยี่ยมชม', 'learner': 'ผู้เรียน', 'instructor': 'ผู้สอน', 'admin': 'ผู้ดูแล'}
ALL3 = ('learner', 'instructor', 'admin')
ALL4 = ('guest',) + ALL3
TEACHERS = ('instructor', 'admin')

# ตัวช่วยหา React context ของ mockup (value ที่มี go/state/login ฯลฯ) จาก fiber ของ #root
INIT_JS = """
window.__viperApp = function () {
  const root = document.getElementById('root');
  const key = root && Object.keys(root).find(k => k.startsWith('__reactContainer'));
  if (!key) return null;
  const stack = [root[key]];
  while (stack.length) {
    const f = stack.pop();
    if (!f) continue;
    const v = f.memoizedProps && f.memoizedProps.value;
    if (v && typeof v.go === 'function' && v.state && typeof v.login === 'function') return v;
    if (f.sibling) stack.push(f.sibling);
    if (f.child) stack.push(f.child);
  }
  return null;
};
"""
FREEZE_CSS = (
    '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;'
    'transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important;'
    'caret-color:transparent!important}'
)


# ---------------------------------------------------------------- ตัวช่วยสั่งหน้า
def app(page, fn: str, *args):
    """เรียกฟังก์ชันใน context ของแอป เช่น app(page, 'go', 'lab', 'detection')"""
    return page.evaluate("([fn, args]) => window.__viperApp()[fn](...args)", [fn, list(args)])


def settle(page, ms: int = 350):
    page.wait_for_timeout(ms)


def go(page, view: str, ident: Optional[str] = None):
    app(page, 'go', view, ident)
    settle(page, 500 if view in ('lab', 'design') else 300)


def dismiss_toast(page):
    app(page, 'notify', '')
    settle(page, 100)


def btn(page, name: str, exact: bool = False):
    return page.get_by_role('button', name=name, exact=exact).first


def click(page, name: str, exact: bool = False, wait: int = 300):
    btn(page, name, exact).click()
    settle(page, wait)


def lab_load_template(page, title_part: str = 'Object Detection Starter'):
    """เปิด template ใน Free Lab ด้วยปุ่มจริงในหน้า Templates แล้วรอให้ Lab แสดง"""
    go(page, 'templates')
    page.locator('article', has_text=title_part).first.get_by_role('button', name='เปิดใน Free Lab').click()
    settle(page, 700)
    dismiss_toast(page)


def lab_ensure_library(page):
    """เปิดคลังโหนดถ้าปิดอยู่ (จอแคบปิดไว้ตอนเริ่ม)"""
    if btn(page, 'ยุบคลังโหนด').count() and btn(page, 'ยุบคลังโหนด').is_visible():
        return
    page.locator('button.library-toggle, button[aria-label*="คลังโหนด"]').first.click()
    settle(page, 400)


# ---------------------------------------------------------------- สูตรถ่ายแต่ละแถว
@dataclass
class Row:
    id: str
    title: str
    roles: tuple
    nav: Optional[tuple] = None                       # (view,) หรือ (view, id)
    steps: Optional[Callable] = None                  # ทำต่อหลังเปลี่ยนหน้า (คลิกเปิด modal ฯลฯ)
    shot: str = 'full'                                # full | view | el:<selector>
    widths: tuple = (1440, 375)
    note: str = ''
    after_login: Optional[Callable] = None            # ทำก่อน nav (ใช้กับหน้าที่ต้องเตรียมสถานะ)
    extra: dict = field(default_factory=dict)
    theme: str = 'light'                              # ธีมของภาพ mockup แถวนี้ (ใช้ตั้งธีมของจริงให้ตรง ตอน --target real)


def _bell(page):
    click(page, 'การแจ้งเตือน')


def _bell_empty(page):
    _bell(page)
    click(page, 'อ่านทั้งหมด')
    click(page, 'ยังไม่อ่าน')


def _account_menu(page):
    click(page, 'เมนูบัญชี')


def _theme_dark(page):
    click(page, 'ใช้ธีมมืด')


def _profile_tab(label):
    def run(page):
        click(page, label, exact=False)
    return run


def _profile_save_toast(page):
    click(page, 'แก้ไขข้อมูล')
    page.get_by_role('button', name=re.compile('^บันทึก')).first.click()
    settle(page, 300)


def _users_confirm(page):
    page.get_by_role('switch', name=re.compile('^สิทธิ์ผู้สอนของ')).first.click()
    settle(page, 300)


def _lab_help(page):
    click(page, 'วิธีใช้ Lab')


def _tpl_new(page):
    click(page, 'สร้าง Template')


def _tpl_edit(page):
    click(page, 'ทั้งหมด')
    page.get_by_role('button', name=re.compile('^แก้ไข ')).first.click()
    settle(page, 300)


def _tpl_delete_confirm(page):
    _tpl_edit(page)
    page.get_by_role('button', name=re.compile('ลบ')).first.click()
    settle(page, 300)


def _tpl_detail(page):
    page.get_by_role('button', name='รายละเอียด', exact=True).first.click()
    settle(page, 400)


def _log_detail(page):
    page.get_by_role('button', name=re.compile('^ดูรายละเอียด')).first.click()
    settle(page, 300)


def _submission_detail(role):
    def run(page):
        if role == 'learner':
            page.locator('.submission-list button, .submission-item, .history-item').first.click()
            settle(page, 300)
    return run


def _course_form(page):
    click(page, 'สร้างคอร์ส')


def _lesson_editor(page):
    page.get_by_role('button', name='เนื้อหา', exact=True).first.click()
    settle(page, 300)


def _lab_library_open(page):
    lab_ensure_library(page)
    click(page, 'Open all')


def _lab_template_loaded(page):
    lab_load_template(page)


def _lab_run(page):
    lab_load_template(page)
    btn(page, 'รัน', exact=True).click()
    page.wait_for_selector('button[aria-label="รัน"]:not(.is-running)', timeout=20000)
    dismiss_toast(page)
    click(page, 'ภาพและผลลัพธ์')
    settle(page, 500)


def _lab_compare(page):
    _lab_run(page)
    page.get_by_role('button', name=re.compile('^เปรียบเทียบรอบ')).first.click()
    dismiss_toast(page)
    settle(page, 300)


def _lab_list_mode(page):
    lab_load_template(page)
    click(page, 'เปลี่ยนเป็นรายการโหนด')
    dismiss_toast(page)


def _guest_menu(page):
    click(page, 'เมนูโปรไฟล์')


def _login_provider(page):
    page.get_by_role('button', name=re.compile('ดำเนินการต่อด้วย Google')).first.click()
    settle(page, 300)


ROWS: list[Row] = [
    # ---- หน้า (view ใน App.jsx)
    Row('P-01', 'home · ผู้เยี่ยมชม (GuestHome)', ('guest',), ('home',)),
    Row('P-02', 'home · ผู้เรียน (Dashboard)', ('learner',), ('home',)),
    Row('P-03', 'home · ผู้สอน (InstructorDashboard)', ('instructor',), ('home',)),
    Row('P-04', 'home · ผู้ดูแล (AdminDashboard)', ('admin',), ('home',)),
    Row('P-05', 'lessons (CourseCatalog)', ALL4, ('lessons',)),
    Row('P-06', 'course (CoursePage)', ALL4, ('course', 'course-image-processing')),
    Row('P-07', 'lesson (LessonPage)', ALL4, ('lesson', 'detection')),
    Row('P-08', 'assignment (LessonPage ชื่อเรียกอีกแบบ)', ALL3, ('assignment', 'detection')),
    Row('P-09', 'teach (TeachHome)', TEACHERS, ('teach',)),
    Row('P-10', 'teach · ผู้เรียนไม่มีสิทธิ์ (TEACH_VIEWS guard)', ('learner',), ('teach',)),
    Row('P-11', 'teachCourse (CourseEditor)', TEACHERS, ('teachCourse', 'course-image-processing')),
    Row('P-12', 'design (Lab โหมดออกแบบ + DesignerPanel)', TEACHERS, ('design', 'detection')),
    Row('P-13', 'lab · Free Lab', ALL3, ('lab',)),
    Row('P-14', 'lab · โหมดเรียน (Guided Lab ของบทเรียน)', ('learner',), ('lab', 'detection')),
    Row('P-15', 'lab · พรีวิวแบบผู้เรียน', TEACHERS, ('lab', 'detection')),
    Row('P-16', 'lab · ถูกกัน (ยังไม่ลงทะเบียน)', ('learner',), ('lab', 'cv-intro')),
    Row('P-17', 'history (LearningHistory · My Submissions)', ALL3, ('history',)),
    Row('P-18', 'review (Reviews · Submissions ฝั่งผู้สอน)', TEACHERS, ('review',)),
    Row('P-19', 'grades (Gradebook ฝั่งผู้เรียน)', ALL3, ('grades',)),
    Row('P-20', 'teachGrades (Gradebook ฝั่งผู้สอน)', TEACHERS, ('teachGrades',)),
    Row('P-21', 'announcements (Announcements)', ALL4, ('announcements',),
        note='ไม่มีเมนูหลักไปหน้านี้ ใช้ go() เปิดตรง (เข้าได้จากปุ่มใน LogDetail ของเหตุการณ์ ANNOUNCEMENT_CREATE)'),
    Row('P-22', 'templates (TemplateLibrary)', ALL4, ('templates',)),
    Row('P-23', 'users (AdminUsers)', ('admin',), ('users',)),
    Row('P-24', 'logs (PlatformLogs)', ('admin',), ('logs',)),
    Row('P-25', 'profile · แท็บภาพรวม (AccountProfile)', ALL3, ('profile',)),
    Row('P-26', 'profile · แท็บประวัติ', ALL3, ('profile',), _profile_tab('ประวัติ')),
    Row('P-27', 'profile · แท็บผลงาน', ALL3, ('profile',), _profile_tab('ผลงาน')),
    Row('P-28', 'profile · แท็บแก้ไขข้อมูล', ALL3, ('profile',), _profile_tab('แก้ไขข้อมูล')),
    Row('P-29', 'profile · ผู้เยี่ยมชม (GuestProfile)', ('guest',), ('profile',)),
    Row('P-30', 'login (Login)', ('guest',), None, lambda p: app(p, 'showLogin', 'home')),
    Row('P-31', 'login · เลือกบัญชี Google สาธิต (modal)', ('guest',), None,
        lambda p: (app(p, 'showLogin', 'home'), settle(p, 300), _login_provider(p)), shot='view'),
    # ---- ส่วนร่วม
    Row('C-01', 'PlatformHeader (เมนูตามบทบาท, skip link)', ALL3, ('home',), shot='el:header.global-header'),
    Row('C-02', 'GuestHeader', ('guest',), ('home',), shot='el:header.global-header'),
    Row('C-03', 'GuestHeader · เมนูโปรไฟล์ผู้เยี่ยมชม', ('guest',), ('home',), _guest_menu, shot='view'),
    Row('C-04', 'กระดิ่ง · รายการแจ้งเตือน', ALL3, ('home',), _bell, shot='view'),
    Row('C-05', 'กระดิ่ง · สถานะว่าง (ยังไม่อ่าน หลังอ่านทั้งหมด)', ALL3, ('home',), _bell_empty, shot='view'),
    Row('C-06', 'เมนูบัญชี (รวมปุ่มสลับบัญชีสาธิต)', ALL3, ('home',), _account_menu, shot='view'),
    Row('C-25', 'บล็อกสลับบัญชีสาธิต (demo-switch)', ALL3, ('home',), _account_menu, shot='el:.demo-switch'),
    Row('C-07', 'ธีมมืด', ALL4, ('home',), _theme_dark, theme='dark'),
    Row('C-08', 'footer', ALL4, ('home',), shot='el:footer.site-footer'),
    Row('C-09', 'toast', ALL3, ('profile',), _profile_save_toast, shot='view',
        note='toast แสดงหลังบันทึกโปรไฟล์ (ถ่ายทันที ก่อนหายใน 5.5 วินาที)',
        extra={'keep_toast': True}),
    Row('C-10', 'modal ยืนยัน (Modal type=confirm)', ('admin',), ('users',), _users_confirm, shot='view'),
    Row('C-11', 'modal ช่วยเหลือ Lab', ALL3, ('lab',), _lab_help, shot='view'),
    Row('C-12', 'modal บันทึก/สร้าง Template (SaveTemplateDialog สร้างใหม่)', ALL3, ('templates',), _tpl_new, shot='view'),
    Row('C-13', 'modal แก้ไข Template (SaveTemplateDialog แก้ของเดิม)', ALL3, ('templates',), _tpl_edit, shot='view'),
    Row('C-14', 'modal ยืนยันลบ Template (พิมพ์ชื่อเพื่อยืนยัน)', ALL3, ('templates',), _tpl_delete_confirm, shot='view'),
    Row('C-15', 'TemplateDetail (modal รายละเอียด + ความคิดเห็น)', ALL4, ('templates',), _tpl_detail, shot='view'),
    Row('C-16', 'LogDetail (modal รายละเอียดเหตุการณ์)', ('admin',), ('logs',), _log_detail, shot='view'),
    Row('C-17', 'SubmissionDetail (รายละเอียดงานที่ส่ง ฝั่งผู้เรียน/ผู้สอน)', ALL3, None, None),
    Row('C-18', 'CourseForm (modal สร้าง/แก้คอร์ส)', TEACHERS, ('teach',), _course_form, shot='view'),
    Row('C-19', 'LessonEditor (modal แก้บทเรียน)', TEACHERS, ('teachCourse', 'course-image-processing'), _lesson_editor, shot='view'),
    Row('C-20', 'Lab · คลังโหนด (node library)', ALL3, ('lab',), _lab_library_open, shot='view'),
    Row('C-21', 'Lab · canvas + โหนดของ Free Lab (เปิดจาก template)', ALL3, None, _lab_template_loaded, shot='view'),
    Row('C-22', 'Lab · แผงผลลัพธ์หลังรัน (ResultImages, Scene)', ALL3, None, _lab_run, shot='view'),
    Row('C-23', 'Lab · แท็บเปรียบเทียบรอบ (RunComparison)', ALL3, None, _lab_compare, shot='view'),
    Row('C-24', 'Lab · มุมมองรายการโหนดบนจอแคบ', ALL3, None, _lab_list_mode, shot='view', widths=(375,)),
]
ROW_BY_ID = {r.id: r for r in ROWS}


# C-17 ต้องใช้ขั้นตอนต่างกันตามบทบาท
def _c17(page, role):
    if role == 'learner':
        go(page, 'history')
        page.locator('.submission-view-toolbar ~ * button').first.click()
    else:
        go(page, 'review')
    settle(page, 400)


# ---------------------------------------------------------------- ตรวจแถวเทียบ parity.md
def parity_ids(section: str) -> list[str]:
    """อ่านรหัสแถวจาก tasks/parity.md: section 'P|C' = ส่วนที่ 1, 'R' = ส่วนที่ 2"""
    text = PARITY_MD.read_text(encoding='utf-8')
    pat = r'^\|\s*(%s-\d{2})\s*\|' % ('[PC]' if section == 'PC' else section)
    return re.findall(pat, text, flags=re.M)


SRC_FILES = ['Platform.jsx', 'Learning.jsx', 'Teaching.jsx', 'Guest.jsx', 'App.jsx', 'ui.jsx']


def source_names() -> dict[str, list[tuple[str, bool]]]:
    """ชื่อ function/const ระดับบนสุดของแต่ละไฟล์ใน source mockup พร้อมค่า export"""
    found: dict[str, list[tuple[str, bool]]] = {}
    for fname in SRC_FILES:
        text = (MOCKUP_DIR / 'src' / fname).read_text(encoding='utf-8')
        names = []
        for m in re.finditer(r'^(export\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=)', text, flags=re.M):
            names.append((m.group(2) or m.group(3), bool(m.group(1))))
        found[fname] = names
    return found


def check_components(md_text: str) -> bool:
    """ทุกชื่อใน source ต้องปรากฏในส่วนที่ 3 ของ parity.md เป็น `ชื่อ`"""
    section = md_text.split('## ส่วนที่ 3', 1)[-1]
    missing, total = [], 0
    for fname, names in source_names().items():
        n_export = sum(1 for _, e in names if e)
        print(f'  {fname}: {len(names)} ตัว (export {n_export})')
        total += len(names)
        missing += [f'{fname}:{n}' for n, _ in names if f'`{n}`' not in section]
    print(f'  รวม {total} ตัว')
    if missing:
        print('ไม่มีแถวในส่วนที่ 3 ของ parity.md:', missing)
    return not missing


def check_rows() -> int:
    if not PARITY_MD.exists():
        print('ไม่พบ tasks/parity.md', file=sys.stderr)
        return 1
    text = PARITY_MD.read_text(encoding='utf-8')
    md = parity_ids('PC')
    mine = [r.id for r in ROWS]
    dup = sorted({i for i in md if md.count(i) > 1})
    only_md, only_script = sorted(set(md) - set(mine)), sorted(set(mine) - set(md))
    r_ids = parity_ids('R')
    print(f'parity.md ส่วนที่ 1: {len(md)} แถว · สคริปต์: {len(mine)} แถว · ส่วนที่ 2: {len(r_ids)} แถว')
    if dup:
        print('รหัสซ้ำใน parity.md:', dup)
    if only_md:
        print('มีใน parity.md แต่ไม่มีสูตรถ่ายในสคริปต์:', only_md)
    if only_script:
        print('มีในสคริปต์แต่ไม่มีใน parity.md:', only_script)
    print('ตรวจ component/function ของ mockup เทียบส่วนที่ 3:')
    comps_ok = check_components(text)
    bad = dup or only_md or only_script or not comps_ok or len(set(r_ids)) != len(r_ids)
    print('CHECK ROWS FAIL' if bad else 'CHECK ROWS PASS')
    return 1 if bad else 0


# ---------------------------------------------------------------- เซิร์ฟเวอร์และการถ่าย
def port_open(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(('127.0.0.1', port)) == 0


class MockupServer:
    """เปิด python -m http.server จาก outputs/viper-learning-v2 แล้วปิดเมื่อจบ"""

    def __init__(self, port: int):
        self.port, self.proc = port, None

    def __enter__(self):
        if port_open(self.port):
            raise SystemExit(f'พอร์ต {self.port} ถูกใช้อยู่แล้ว ปิดตัวที่ใช้อยู่ก่อน หรือใช้ --no-server ถ้าต้องการใช้ตัวนั้น')
        self.proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(self.port), '--bind', '127.0.0.1'],
                                     cwd=MOCKUP_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            if port_open(self.port):
                return self
            time.sleep(0.1)
        raise SystemExit('เปิด http.server ไม่สำเร็จ')

    def __exit__(self, *exc):
        if self.proc:
            self.proc.terminate()
            self.proc.wait(timeout=5)


def capture(browser, base_url: str, row: Row, role: str, width: int, out: Path) -> dict:
    height = SIZES[width]
    fname = f'{row.id}__{role}__{width}.png'
    entry = {'row': row.id, 'role': role, 'width': width, 'height': height, 'file': fname, 'ok': False, 'note': row.note}
    ctx = browser.new_context(viewport={'width': width, 'height': height}, locale='th-TH',
                              timezone_id='Asia/Bangkok', reduced_motion='reduce', color_scheme='light')
    ctx.add_init_script(INIT_JS)
    page = ctx.new_page()
    page.set_default_timeout(6000)
    errors: list[str] = []
    page.on('pageerror', lambda e: errors.append(str(e)[:200]))
    try:
        page.goto(base_url, wait_until='networkidle')
        page.wait_for_function('window.__viperApp && window.__viperApp()', timeout=10000)
        page.add_style_tag(content=FREEZE_CSS)
        if role != 'guest':
            app(page, 'login', ROLE_ACCOUNT[role], 'google')
            settle(page, 300)
        if not row.extra.get('keep_toast'):
            dismiss_toast(page)
        if row.id == 'C-17':
            _c17(page, role)
        else:
            if row.nav:
                go(page, *row.nav)
                if not row.extra.get('keep_toast'):
                    dismiss_toast(page)
            if row.steps:
                row.steps(page)
        settle(page, 250)
        path = out / fname
        if row.shot.startswith('el:'):
            page.locator(row.shot[3:]).first.screenshot(path=str(path))
        else:
            page.screenshot(path=str(path), full_page=(row.shot == 'full'))
        entry['ok'] = True
        if errors:
            entry['note'] = (entry['note'] + ' · ' if entry['note'] else '') + 'pageerror: ' + '; '.join(errors[:2])
    except Exception as exc:  # noqa: BLE001 - บันทึกทุกความล้มเหลวลง manifest แล้วถ่ายแถวถัดไปต่อ
        entry['error'] = f'{type(exc).__name__}: {str(exc).splitlines()[0][:200]}'
    finally:
        ctx.close()
    return entry


def run_mockup(args) -> int:
    from playwright.sync_api import sync_playwright

    cfg = TARGETS['mockup']
    out = Path(args.out) if args.out else OUT_ROOT / 'mockup'
    out.mkdir(parents=True, exist_ok=True)
    wanted = set(args.rows.split(',')) if args.rows else None
    roles_filter = set(args.roles.split(',')) if args.roles else None
    widths_filter = {int(w) for w in args.widths.split(',')} if args.widths else None
    if wanted:
        unknown = wanted - set(ROW_BY_ID)
        if unknown:
            raise SystemExit(f'ไม่รู้จักแถว: {sorted(unknown)}')
    jobs = [(r, role, w) for r in ROWS if not wanted or r.id in wanted
            for role in r.roles if not roles_filter or role in roles_filter
            for w in r.widths if not widths_filter or w in widths_filter]
    print(f'จะถ่าย {len(jobs)} ภาพ -> {out}')

    def execute(base_url):
        manifest = []
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            for i, (row, role, w) in enumerate(jobs, 1):
                entry = capture(browser, base_url, row, role, w, out)
                manifest.append(entry)
                print(f'[{i}/{len(jobs)}] {"OK  " if entry["ok"] else "FAIL"} {entry["file"]}'
                      + ('' if entry['ok'] else f'  {entry.get("error")}'), flush=True)
            browser.close()
        return manifest

    base = f'http://127.0.0.1:{cfg["port"]}{cfg["path"]}'
    if args.no_server:
        manifest = execute(base)
    else:
        with MockupServer(cfg['port']):
            manifest = execute(base)

    mpath = out / 'manifest.json'
    if wanted or roles_filter or widths_filter:  # ถ่ายบางส่วน: รวมเข้ากับ manifest เดิม
        old = json.loads(mpath.read_text(encoding='utf-8'))['shots'] if mpath.exists() else []
        key = lambda e: (e['row'], e['role'], e['width'])  # noqa: E731
        merged = {key(e): e for e in old}
        merged.update({key(e): e for e in manifest})
        manifest = sorted(merged.values(), key=key)
    data = {
        'target': 'mockup', 'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'sizes': [f'{w}x{h}' for w, h in SIZES.items()],
        'total': len(manifest), 'ok': sum(e['ok'] for e in manifest),
        'failed': [e['file'] for e in manifest if not e['ok']],
        'shots': manifest,
    }
    mpath.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'สำเร็จ {data["ok"]}/{data["total"]} · manifest: {mpath}')
    return 0 if not data['failed'] else 2


# ================================================================ --target real (T22)
# ถ่ายของจริงที่ http://localhost:5173 ด้วย session ที่ login ไว้แล้ว (ไม่ login Google เอง)
# ความปลอดภัย: ทุก context บล็อกคำขอที่ไม่ใช่ GET ไปที่ /api/** (abort + บันทึก) และไม่คลิกปุ่มที่เขียนข้อมูล
SESSION_DIR = OUT_ROOT / 'sessions'
REAL_SESSION = {  # บทบาท -> (ไฟล์ storage_state, id ที่ต้องเป็น, role ที่ต้องเป็น)
    'admin': ('admin.json', 2, 'admin'),
    'learner': ('learner.json', 1, None),
    'instructor': ('learner.json', 1, None),  # ผู้สอนจำลอง: session ผู้เรียน + จำลอง can_teach ที่ /api/auth/me
}
SIM_NOTE = 'ผู้สอนจำลอง (can_teach จำลองที่ /api/auth/me)'


def _try_click(page, pattern, notes: list, kind: str = 'button', wait: int = 400) -> bool:
    """คลิกเพื่อแสดงผลเท่านั้น: ไม่พบหรือปิดใช้ ก็ข้ามแล้วบันทึกหมายเหตุ"""
    loc = page.get_by_role(kind, name=re.compile(pattern, re.I)).first
    try:
        if loc.count() == 0 or not loc.is_visible():
            notes.append(f'ไม่พบ "{pattern}" ในของจริง')
            return False
        if not loc.is_enabled():
            notes.append(f'"{pattern}" ปิดใช้')
            return False
        loc.click(timeout=3000)
        settle(page, wait)
        return True
    except Exception as exc:  # noqa: BLE001
        notes.append(f'คลิก "{pattern}" ไม่ได้: {type(exc).__name__}')
        return False


def _real_bell(page, notes):
    _try_click(page, '^การแจ้งเตือน', notes)


def _real_bell_empty(page, notes):
    if _try_click(page, '^การแจ้งเตือน', notes):
        _try_click(page, '^อ่านทั้งหมด', notes, wait=200)
        _try_click(page, '^ยังไม่อ่าน', notes, wait=200)


def _real_account(page, notes):
    _try_click(page, '^เมนูบัญชี', notes)


def _real_guest_menu(page, notes):
    _try_click(page, '(เมนูโปรไฟล์|โปรไฟล์)', notes)


def _real_profile_tab(label):
    def run(page, notes):
        if not (_try_click(page, label, notes, kind='tab') or _try_click(page, label, notes)):
            pass
    return run


def _real_click(pattern, kind='button'):
    def run(page, notes):
        _try_click(page, pattern, notes, kind=kind)
    return run


def _real_lab_help(page, notes):
    _try_click(page, '(วิธีใช้|Help)', notes)


def _real_lab_library(page, notes):
    _try_click(page, '^Open all', notes)


def _real_tpl_edit(page, notes):
    _try_click(page, '^ของฉัน', notes, wait=300)  # แท็บของฉัน (ผู้เรียนแก้ได้เฉพาะของตัวเอง; admin แก้ได้ทุกแท็บ)
    _try_click(page, '^แก้ไข ', notes)


def _real_tpl_delete(page, notes):
    _try_click(page, '^ของฉัน', notes, wait=300)
    if _try_click(page, '^แก้ไข ', notes):
        _try_click(page, 'ลบ', notes)  # เปิดกล่องยืนยันเท่านั้น ไม่กดยืนยัน (และ DELETE ถูกบล็อกอยู่แล้ว)


def _real_log_detail(page, notes):
    _try_click(page, '(ดูรายละเอียด|รายละเอียด)', notes)


# id -> (path, steps, shot, note)  ใช้กับแถว P/C; shot: full | view | el:<selector>
REAL_SPEC: dict[str, tuple] = {
    'P-01': ('/', None, 'full', ''), 'P-02': ('/', None, 'full', ''), 'P-03': ('/', None, 'full', ''),
    'P-04': ('/', None, 'full', ''),
    'P-05': ('/courses', None, 'full', ''), 'P-06': ('/courses/course-image-processing', None, 'full', 'route (เสนอ)'),
    'P-07': ('/lessons/detection', None, 'full', 'route (เสนอ)'), 'P-08': ('/lessons/detection', None, 'full', 'เหมือน P-07'),
    'P-09': ('/teach', None, 'full', ''), 'P-10': ('/teach', None, 'full', ''),
    'P-11': ('/teach/course-image-processing', None, 'full', ''),
    'P-12': ('/lab', None, 'view', 'ไม่มี route ตัวออกแบบ: ถ่าย /lab'),
    'P-13': ('/lab', None, 'view', ''),
    'P-14': ('/lab', None, 'view', 'ไม่มีโหมดเรียน: ถ่าย /lab'),
    'P-15': ('/lab', None, 'view', 'ไม่มีพรีวิวแบบผู้เรียน: ถ่าย /lab'),
    'P-16': ('/lab', None, 'view', 'ไม่มีการกันตามลงทะเบียน: ถ่าย /lab'),
    'P-17': ('/submissions?side=mine', None, 'full', ''), 'P-18': ('/submissions', None, 'full', ''),
    'P-19': ('/submissions?tab=grades', None, 'full', ''), 'P-20': ('/submissions?tab=grades', None, 'full', ''),
    'P-21': ('/announcements', None, 'full', ''), 'P-22': ('/templates', None, 'full', ''),
    'P-23': ('/users', None, 'full', ''), 'P-24': ('/logs', None, 'full', ''),
    'P-25': ('/profile', None, 'full', ''),
    'P-26': ('/profile', _real_profile_tab('ประวัติ'), 'full', ''),
    'P-27': ('/profile', _real_profile_tab('ผลงาน'), 'full', ''),
    'P-28': ('/profile', None, 'full', 'ไม่มีแท็บแก้ไข (ตัดออก): ถ่าย /profile'),
    'P-29': ('/profile', None, 'full', 'ผู้เยี่ยมชมถูกพาไป Login'),
    'P-30': ('/login', None, 'full', ''),
    'P-31': ('/login', None, 'full', 'ไม่คลิกปุ่ม Google (ไปหน้า OAuth จริง): ถ่ายหน้า /login'),
    'C-01': ('/', None, 'el:header.global-header', ''), 'C-02': ('/', None, 'el:header.global-header', ''),
    'C-03': ('/', _real_guest_menu, 'view', ''),
    'C-04': ('/', _real_bell, 'view', ''), 'C-05': ('/', _real_bell_empty, 'view', ''),
    'C-06': ('/', _real_account, 'view', ''),
    'C-25': ('/', _real_account, 'view', 'ไม่มีบล็อกสลับบัญชีสาธิต: ถ่ายเมนูบัญชี'),
    'C-07': ('/', None, 'full', ''), 'C-08': ('/', None, 'el:footer.site-footer', ''),
    'C-09': ('/profile', None, 'view', 'โปรไฟล์อ่านอย่างเดียว ไม่มี toast ให้ถ่ายโดยไม่เขียนข้อมูล: ถ่าย /profile'),
    'C-10': ('/users', None, 'view', 'ไม่คลิกสวิตช์สิทธิ์ (เขียนข้อมูล): ถ่าย /users'),
    'C-11': ('/lab', _real_lab_help, 'view', ''),
    'C-12': ('/lab', _real_click('^SAVE TEMPLATE'), 'view', 'ปุ่มบันทึก Template อยู่ใน Lab (เปิดกล่องดูเท่านั้น ไม่บันทึก)'),
    'C-13': ('/templates', _real_tpl_edit, 'view', ''),
    'C-14': ('/templates', _real_tpl_delete, 'view', ''),
    'C-15': ('/templates', _real_click('^ดูรายละเอียด '), 'view', ''),
    'C-16': ('/logs', _real_log_detail, 'view', ''),
    'C-17': ('/submissions', None, 'full', ''),
    'C-18': ('/teach', _real_click('สร้างคอร์ส'), 'view', ''),
    'C-19': ('/teach/course-image-processing', None, 'view', ''),
    'C-20': ('/lab', _real_lab_library, 'view', ''),
    'C-21': ('/lab', None, 'view', 'ไม่เปิด template (ต้อง POST /load): ถ่าย /lab ว่าง'),
    'C-22': ('/lab', None, 'view', 'ไม่รัน pipeline (เขียนข้อมูล): ถ่าย /lab'),
    'C-23': ('/lab', None, 'view', 'ตัดออก: ถ่าย /lab'),
    'C-24': ('/lab', None, 'view', 'ตัดออก: ถ่าย /lab (375)'),
}

# แถว R-xx (ความสามารถของจริง) -> (กุญแจภาพ, บทบาท) กุญแจเดียวกันใช้ภาพเดียวกัน
R_SHOTS: dict[str, tuple] = {
    'lab': ('/lab', None, 'view'),
    'lab_lib': ('/lab', _real_lab_library, 'view'),
    'templates': ('/templates', None, 'full'),
    'users': ('/users', None, 'full'),
    'account': ('/users', _real_account, 'view'),
    'logs': ('/logs', None, 'full'),
    'login': ('/login', None, 'full'),
}
R_MAP: dict[str, tuple] = {}
for _i in range(1, 44):
    R_MAP[f'R-{_i:02d}'] = ('lab', 'learner')
for _i in (15, 16):
    R_MAP[f'R-{_i:02d}'] = ('lab_lib', 'learner')
for _i in (17, 18, 19, 20, 26, 27, 28, 29, 30, 32, 42):
    R_MAP[f'R-{_i:02d}'] = ('templates', 'learner')
R_MAP['R-31'] = ('templates', 'admin')
for _i in (33, 34):
    R_MAP[f'R-{_i:02d}'] = ('users', 'admin')
R_MAP['R-39'] = ('account', 'admin')
for _i in (36, 37):
    R_MAP[f'R-{_i:02d}'] = ('logs', 'admin')
for _i in (35, 38):
    R_MAP[f'R-{_i:02d}'] = ('login', 'guest')
R_WIDTHS = (1440, 375)


def real_jobs(args):
    """รายการ (row_id, role, width, spec_key) ทั้ง P/C และ R"""
    wanted = set(args.rows.split(',')) if args.rows else None
    roles_filter = set(args.roles.split(',')) if args.roles else None
    widths_filter = {int(w) for w in args.widths.split(',')} if args.widths else None
    jobs = []
    for r in ROWS:
        for role in r.roles:
            for w in r.widths:
                jobs.append((r.id, role, w, r.id))
    for rid in parity_ids('R'):
        key, role = R_MAP[rid]
        for w in R_WIDTHS:
            jobs.append((rid, role, w, key))
    if wanted:
        known = {j[0] for j in jobs}
        if wanted - known:
            raise SystemExit(f'ไม่รู้จักแถว: {sorted(wanted - known)}')
    return [j for j in jobs if (not wanted or j[0] in wanted) and (not roles_filter or j[1] in roles_filter)
            and (not widths_filter or j[2] in widths_filter)]


def real_context(browser, role: str, width: int, theme: str, blocked: list, tag: str):
    kw = {}
    if role != 'guest':
        fname, _, _ = REAL_SESSION[role]
        kw['storage_state'] = str(SESSION_DIR / fname)
    ctx = browser.new_context(viewport={'width': width, 'height': SIZES[width]}, locale='th-TH',
                              timezone_id='Asia/Bangkok', reduced_motion='reduce', color_scheme=theme, **kw)
    ctx.add_init_script(f"try{{localStorage.setItem('viper.platform.theme','{theme}')}}catch(e){{}}")

    def guard(route):
        req = route.request
        if req.method != 'GET':
            blocked.append({'shot': tag, 'method': req.method, 'url': req.url})
            return route.abort()
        if role == 'instructor' and req.url.split('?')[0].endswith('/api/auth/me'):
            resp = route.fetch()
            try:
                body = resp.json()
                body['can_teach'] = True
                return route.fulfill(response=resp, json=body)
            except Exception:  # noqa: BLE001
                return route.fulfill(response=resp)
        return route.continue_()

    ctx.route('**/api/**', guard)
    return ctx


def real_identity(ctx, base: str, role: str) -> dict:
    """ยืนยันตัวตนจริงจาก GET /api/auth/me ก่อนถ่าย (ผ่าน request ของ context ไม่ผ่าน route จำลอง)"""
    resp = ctx.request.get(base + '/api/auth/me')
    if role == 'guest':
        if resp.status != 401:
            raise RuntimeError(f'guest ควรได้ 401 แต่ได้ {resp.status}')
        return {'status': 401}
    if not resp.ok:
        raise RuntimeError(f'/api/auth/me ตอบ {resp.status} (session หมดอายุ?)')
    me = resp.json()
    _, want_id, want_role = REAL_SESSION[role]
    if me.get('id') != want_id or (want_role and me.get('role') != want_role):
        raise RuntimeError(f'ตัวตนไม่ตรง: ได้ id={me.get("id")} role={me.get("role")} ต้องการ id={want_id} role={want_role}')
    if role != 'admin' and me.get('role') == 'admin':
        raise RuntimeError('บทบาท ' + role + ' ต้องไม่ใช่ admin')
    return {'id': me.get('id'), 'role': me.get('role')}


def real_shot(browser, base: str, jid: tuple, out: Path, blocked: list, ident_seen: dict, spec_of) -> dict:
    rid, role, width, key = jid
    height = SIZES[width]
    fname = f'{rid}__{role}__{width}.png'
    row = ROW_BY_ID.get(rid)
    theme = row.theme if row else 'light'
    path, steps, shot, note = spec_of(rid, key)
    notes: list[str] = [note] if note else []
    if role == 'instructor':
        notes.append(SIM_NOTE)
    entry = {'row': rid, 'role': role, 'width': width, 'height': height, 'file': fname, 'ok': False,
             'theme': theme, 'path': path, 'simulated': role == 'instructor'}
    ctx = real_context(browser, role, width, theme, blocked, fname)
    try:
        ident = real_identity(ctx, base, role)
        entry['identity'] = ident
        if role not in ident_seen:
            ident_seen[role] = ident
            print(f'  identity {role}: GET /api/auth/me -> {ident}' + (f' ({SIM_NOTE})' if role == 'instructor' else ''))
        page = ctx.new_page()
        page.set_default_timeout(6000)
        errors: list[str] = []
        page.on('pageerror', lambda e: errors.append(str(e)[:160]))
        page.goto(base + path, wait_until='load')
        try:
            page.wait_for_load_state('networkidle', timeout=8000)
        except Exception:  # noqa: BLE001
            pass
        page.add_style_tag(content=FREEZE_CSS)
        settle(page, 1500 if path.startswith('/lab') else 700)
        entry['final_url'] = page.url.replace(base, '')
        if steps:
            steps(page, notes)
        settle(page, 300)
        dest = out / fname
        if shot.startswith('el:'):
            loc = page.locator(shot[3:]).first
            if loc.count():
                loc.screenshot(path=str(dest))
            else:
                notes.append(f'ไม่พบ {shot[3:]}: ถ่ายทั้งหน้าแทน')
                page.screenshot(path=str(dest), full_page=True)
        else:
            page.screenshot(path=str(dest), full_page=(shot == 'full'))
        entry['ok'] = True
        if errors:
            notes.append('pageerror: ' + '; '.join(errors[:2]))
    except Exception as exc:  # noqa: BLE001
        entry['error'] = f'{type(exc).__name__}: {str(exc).splitlines()[0][:200]}'
    finally:
        entry['note'] = ' · '.join(n for n in notes if n)
        ctx.close()
    return entry


def run_real(args) -> int:
    from playwright.sync_api import sync_playwright

    cfg = TARGETS['real']
    base = f'http://localhost:{cfg["port"]}'
    try:
        socket.create_connection(('localhost', cfg['port']), timeout=1).close()
    except OSError:
        raise SystemExit(f'ไม่พบเซิร์ฟเวอร์ที่พอร์ต {cfg["port"]} (สคริปต์นี้ไม่เปิด/ปิดเซิร์ฟเวอร์ของจริง)')
    out = Path(args.out) if args.out else OUT_ROOT / 'real'
    out.mkdir(parents=True, exist_ok=True)
    jobs = real_jobs(args)
    print(f'จะถ่าย {len(jobs)} ภาพ -> {out}')
    blocked: list[dict] = []
    ident_seen: dict = {}

    def spec_of(rid, key):
        if rid in ROW_BY_ID:
            return REAL_SPEC[rid]
        p, st, sh = R_SHOTS[key]
        return p, st, sh, 'แถวความสามารถของจริง (R) ถ่ายหน้าที่เกี่ยวข้อง ไม่ได้ทดสอบการทำงาน'

    manifest = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for i, jid in enumerate(jobs, 1):
            entry = real_shot(browser, base, jid, out, blocked, ident_seen, spec_of)
            manifest.append(entry)
            print(f'[{i}/{len(jobs)}] {"OK  " if entry["ok"] else "FAIL"} {entry["file"]}'
                  + ('' if entry['ok'] else f'  {entry.get("error")}'), flush=True)
        browser.close()
    mpath = out / 'manifest.json'
    key = lambda e: (e['row'], e['role'], e['width'])  # noqa: E731
    old_blocked: list = []
    if (args.rows or args.roles or args.widths) and mpath.exists():
        prev = json.loads(mpath.read_text(encoding='utf-8'))
        merged = {key(e): e for e in prev['shots']}
        merged.update({key(e): e for e in manifest})
        manifest = sorted(merged.values(), key=key)
        old_blocked = prev.get('blocked_requests', [])
    data = {
        'target': 'real', 'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'sizes': [f'{w}x{h}' for w, h in SIZES.items()],
        'identity': ident_seen, 'total': len(manifest), 'ok': sum(e['ok'] for e in manifest),
        'failed': [e['file'] for e in manifest if not e['ok']],
        'blocked_requests': old_blocked + blocked, 'shots': manifest,
    }
    mpath.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'สำเร็จ {data["ok"]}/{data["total"]} · คำขอที่ไม่ใช่ GET ถูกบล็อก {len(blocked)} รายการ · manifest: {mpath}')
    for b in blocked:
        print('  BLOCKED', b['method'], b['url'], '<-', b['shot'])
    return 0 if not data['failed'] else 2


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--target', choices=sorted(TARGETS), default='mockup')
    ap.add_argument('--rows', help='รหัสแถวคั่นด้วยจุลภาค เช่น P-01,C-04 (ไม่ใส่ = ทุกแถว)')
    ap.add_argument('--roles', help='จำกัดบทบาท: guest,learner,instructor,admin')
    ap.add_argument('--widths', help='จำกัดความกว้าง: 1440,375')
    ap.add_argument('--out', help='โฟลเดอร์ผลลัพธ์ (ค่าเริ่มต้น outputs/parity-report/<target>)')
    ap.add_argument('--no-server', action='store_true', help='ใช้เซิร์ฟเวอร์ที่รันอยู่แล้ว ไม่เปิด http.server เอง')
    ap.add_argument('--check', action='store_true', help='ตรวจว่ารหัสแถวตรงกับ tasks/parity.md แล้วจบ')
    ap.add_argument('--list', action='store_true', help='แสดงรายการแถวและจำนวนภาพที่ควรได้แล้วจบ')
    args = ap.parse_args()

    if args.check:
        return check_rows()
    if args.list:
        total = 0
        for r in ROWS:
            n = len(r.roles) * len(r.widths)
            total += n
            print(f'{r.id}  {n:>2}  {",".join(r.roles):<32} {r.title}')
        print(f'รวม {len(ROWS)} แถว, {total} ภาพ')
        return 0
    if args.target == 'real':
        return run_real(args)
    return run_mockup(args)


if __name__ == '__main__':
    sys.exit(main())
