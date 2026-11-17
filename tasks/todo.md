# รายการ task: นำ Mockup v2 ไปลงใน VIPER จริง

แผนและเหตุผล: [plan.md](plan.md) · ตารางเทียบ: `tasks/parity.md` (สร้างใน T2)

คำสั่งตรวจที่ใช้ซ้ำทุก task (รันจากโฟลเดอร์หลัก VIPER):

- **CHECK** `scripts/check.sh` (สร้างใน T3) รวม BE กับ FE แล้วเทียบเส้นฐาน ตอบผ่านหรือไม่ผ่านอย่างเดียว ผู้ทำทุกคนต้องรันก่อนรายงานว่าเสร็จ และ Opus ตัวหลักรันซ้ำเองทุกครั้ง
- **BE** `./.venv/bin/python -m pytest --ignore=tests/compare_yolo` ต้องล้มไม่เกิน 15 รายการเดิม (SURF) เส้นฐานหลัง refactor: ผ่าน 259
- **FE** `cd my-react-flow-app && npm run lint && npm run build` ต้องไม่มี error
- **LAB** เปิด `/lab` ลากโหนด ORB ต่อกับ Image Input แล้วรัน ได้ผลเหมือนก่อนแก้

ขนาด: S = 1–2 ไฟล์, M = 3–5 ไฟล์, L = 5–8 ไฟล์

skill ที่ใช้ทุก task (ไม่เขียนซ้ำในแต่ละข้อ): `incremental-implementation` ตอนทำ, `git-workflow-and-versioning` ทุก commit, `debugging-and-error-recovery` เมื่อเทสต์ล้มหรือผลไม่ตรง รายละเอียดและผลตรวจ skill ภายนอก: plan.md หัวข้อ "Skill และ agent ที่ใช้"

ผู้ทำ: บรรทัด `ผู้ทำ:` ของแต่ละ task บอกว่าใครทำและอยู่ชุดไหน task ในชุดเดียวกันส่งให้ subagent ตัวเดียวทำต่อกันรวด แต่ commit แยกทีละ task วิธีสั่งงานและตรวจรับ: plan.md หัวข้อ "วิธีสั่งงาน subagent"

---

## ระยะ 0: เส้นฐานและความปลอดภัย

### [x] T1 สำรองฐานข้อมูลและเก็บ snapshot ข้อมูล
สำรอง PostgreSQL ทั้งก้อน และเขียนสคริปต์เก็บจำนวนแถวกับ hash รายแถวของตารางที่มีข้อมูลจริง เพื่อใช้เทียบตอนจบ

- เกณฑ์รับ
  - [x] มีไฟล์ `pg_dump` ที่ `outputs/backups/before-mockup-integration/` และกู้คืนลงฐานข้อมูลชั่วคราวได้
  - [x] `tasks/baseline/db-snapshot.json` มีจำนวนแถว, id สูงสุด และ hash รายแถวของ `users`, `templates`, `comments`, `audit_logs`, `results`
  - [x] จำนวนใน snapshot ตรงกับเส้นฐานใน plan.md (4 / 13 / 1 / 2,626 / 31 ณ 16 พ.ย.) หรือบันทึกค่าใหม่พร้อมเวลาที่เก็บ
  - [x] บันทึกใน snapshot ว่า Official template 9 แถวมี workflow แล้ว (เติมโดยโค้ดหลัง refactor ก่อนสำรอง)
- ตรวจ: รัน `scripts/migration_snapshot.py` สองครั้งติดกัน ได้ hash เท่ากัน
- ขึ้นกับ: ไม่มี
- ไฟล์: `scripts/migration_snapshot.py`, `tasks/baseline/db-snapshot.json`
- ขนาด: S
- skill: `deprecation-and-migration`
- ผู้ทำ: Opus ตัวหลัก (high) ทำเอง (เป็นฐานของทุก task)

### [x] T2 สร้างตารางเทียบและถ่ายภาพ mockup ทุกหน้า
ไล่ทุกหน้า modal และส่วนร่วมใน source ของ mockup ลงตาราง พร้อมส่วนที่สองสำหรับความสามารถเดิมของของจริง แล้วถ่ายภาพ mockup เก็บเป็นภาพอ้างอิง

- เกณฑ์รับ
  - [x] `tasks/parity.md` มีแถวครบทุก `view` ใน `App.jsx` (home 4 แบบ, lessons, course, lesson, teach, teachCourse, design, lab, history, review, grades, teachGrades, announcements, templates, users, logs, profile, login) และส่วนร่วม (header, กระดิ่ง, เมนูบัญชี, ธีม, footer, toast, modal ยืนยัน, modal ช่วยเหลือ, modal บันทึก template)
  - [x] ทุกแถวระบุแหล่งข้อมูลจริงและสถานะเป้าหมาย (`ย้าย` / `ว่างตามแผน` / `ตัดออก` + เหตุผล)
  - [x] มีภาพ mockup ของทุกแถวที่ 1440×900 และ 375×812 ใน `outputs/parity-report/mockup/` ครบ 3 บทบาท
- ตรวจ: นับจำนวนแถวเทียบกับจำนวน component ที่ export ใน `Platform.jsx`, `Learning.jsx`, `Teaching.jsx`, `Guest.jsx` และ function ใน `App.jsx` ต้องไม่มีตัวไหนไม่มีแถว
- ขึ้นกับ: ไม่มี
- ไฟล์: `tasks/parity.md`, `scripts/parity_screenshots.py` (ส่วนถ่าย mockup)
- ขนาด: M
- skill: `webapp-testing` (สคริปต์ Playwright ถ่ายภาพ mockup) · ติดตั้งแล้ว 17 พ.ย.: Playwright 1.65.2 ใน `.venv` + Chromium 159 รันด้วย `./.venv/bin/python`
- ผู้ทำ: Sonnet subagent (medium) · ชุด I1

### [x] T3 แก้ lint 3 errors และสร้างสคริปต์ตรวจ `scripts/check.sh`
แก้ `no-constant-binary-expression` ที่ `sidebar.tsx:284` เพื่อให้ lint ใช้เป็นด่านตรวจได้ ต้นเหตุคือรายการ template แบบเก่าที่ซ่อนด้วย `{false && …}` ห้ามลบบล็อกนี้ เพราะเป็นทางเดียวที่เปิดเมนูคลิกขวาและหน้า "About Algorithm" ได้ ให้เปลี่ยนเป็นค่าคงที่ที่มีชื่อแทน เช่น `SHOW_LEGACY_TEMPLATE_LIST`

จากนั้นสร้าง `scripts/check.sh` เป็นด่านตรวจเดียวที่ทุก task และทุกผู้ทำใช้ร่วมกัน เพื่อไม่ให้แต่ละคนตีความคำว่า "ผ่าน" ต่างกัน

- เกณฑ์รับ
  - [x] `npm run lint` ไม่มี error (warning เดิม 1 รายการคงไว้ได้)
  - [x] พฤติกรรมของ sidebar ไม่เปลี่ยน และรายการ template แบบเก่ายังเปิดกลับได้ด้วยค่าคงที่ตัวเดียว
  - [x] `scripts/check.sh` รัน BE (pytest), FE (lint + build) และเทสต์ frontend (`node --test tests/yoloModel.test.cjs`) แล้วเทียบกับเส้นฐานใน `tasks/baseline/test-baseline.json` (ผ่าน ≥ 259, ล้ม ≤ 15 และชุดที่ล้มต้องเป็นชุดเดิม, lint 0 error)
  - [x] ผลสุดท้ายเป็นบรรทัดเดียว `CHECK PASS` หรือ `CHECK FAIL: <เหตุผล>` และ exit code 0 หรือ 1 ตามผล
- ตรวจ: รัน `scripts/check.sh` ได้ PASS; ทดลองใส่ error ใน lint ชั่วคราวแล้วต้องได้ FAIL จากนั้นคืนค่า
- ขึ้นกับ: ไม่มี
- ไฟล์: `my-react-flow-app/src/components/sidebar.tsx`, `scripts/check.sh`, `tasks/baseline/test-baseline.json`
- ขนาด: S
- skill: ใช้แค่ชุดที่ใช้ทุก task (งานเล็ก)
- ผู้ทำ: Opus ตัวหลัก (high) ทำเอง (งานเล็ก)

### จุดตรวจ 0
- [x] agent: ไม่ใช้ รันเทสต์ตามเส้นฐาน
- [x] ไฟล์สำรอง, snapshot, ตารางเทียบ และภาพ mockup ครบ
- [x] BE และ FE ผ่านตามเส้นฐาน

---

## ระยะ 1: โครงหน้า

### [ ] T4 เพิ่ม router และย้าย editor เดิมไปที่ `/lab`
ติดตั้ง `react-router-dom` แยก editor ปัจจุบันออกจาก `App.tsx` เป็นหน้า `LabPage` และสร้าง layout กลางที่มีที่ว่างสำหรับ header

- เกณฑ์รับ
  - [ ] `/lab` แสดง editor เดิมครบ: แท็บ Workflow, sidebar, ปุ่มรัน/หยุด, Log panel
  - [ ] refresh ที่ `/lab` แล้วแท็บและ workflow เดิมยังอยู่ (`n2n_app_tabs`)
  - [ ] route ที่ยังไม่ทำแสดงหน้า "ยังไม่พร้อม" ไม่ใช่หน้าขาว
- ตรวจ: FE, LAB, ทดสอบ undo/redo และ hotkey ลบโหนด
- ขึ้นกับ: T3
- ไฟล์: `package.json`, `src/main.tsx`, `src/App.tsx`, `src/pages/LabPage.tsx`, `src/routes.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering` + `react-router` (ภายนอก) + `source-driven-development` ตรวจด้วย `anthropic-skills:built-in-browser` · ติดตั้งแล้ว 16 พ.ย. ที่ `~/.agents/skills/react-router`
- ผู้ทำ: Opus ตัวหลัก (high) ทำเอง (โครงที่ทุก task ต้องพึ่ง)

### [ ] T5 ย้าย CSS และ component พื้นฐานของ mockup
คัดลอก `Theme.css`, `Density.css`, `Platform.css`, `Learning.css` มาครอบ scope `.viper-platform` และแปลง `ui.jsx` เป็น TypeScript

- เกณฑ์รับ
  - [ ] `Button`, `Badge`, `Empty`, `Modal`, `Markdown` ใช้ได้ใน TSX และ Modal ยังปิดด้วย Escape, กัก focus และคืน focus
  - [ ] ธีมสว่าง/มืดทำงานด้วย token ชุดเดียว
  - [ ] หน้า `/lab` ไม่มี style ใดเปลี่ยน (เทียบภาพก่อนและหลัง)
- ตรวจ: FE, LAB, เทียบภาพ `/lab` ก่อนและหลังที่ 1440 และ 375
- ขึ้นกับ: T4
- ไฟล์: `src/platform/styles/*.css`, `src/platform/ui.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด A

### [ ] T6 Header: เมนูตามสิทธิ์จริง ธีม เมนูบัญชี กระดิ่ง
ย้าย `PlatformHeader` มาใช้ข้อมูลจาก `useAuth()` เมนูขึ้นตาม `role` และ `can_teach` (ก่อน T8 ให้ถือว่า `can_teach` เป็น false)

- เกณฑ์รับ
  - [ ] ผู้ใช้ธรรมดาเห็น Dashboard, Courses, Templates, My Submissions, Lab; admin เห็น Users และ Platform Logs เพิ่ม
  - [ ] ไม่มีปุ่มสลับบัญชีสาธิต; Logout เรียก `/api/auth/logout` จริง
  - [ ] กระดิ่งเปิดได้และแสดงสถานะว่าง ไม่มีตัวเลขค้าง
- ตรวจ: FE, login ด้วยบัญชี admin และบัญชีธรรมดาแล้วเทียบเมนูกับแถว header ในตารางเทียบ
- ขึ้นกับ: T5
- ไฟล์: `src/platform/Header.tsx`, `src/platform/Layout.tsx`, `src/components/UserMenu.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด A

### [ ] T7 หน้าแรกผู้เยี่ยมชมและหน้า Login
ย้าย `GuestHome`, `GuestHeader` และหน้า Login โดยเหลือปุ่ม Google ปุ่มเดียว ปรับ `AuthGate` ให้หน้าแรกเปิดได้โดยไม่ต้อง login

- เกณฑ์รับ
  - [ ] เปิด `/` โดยไม่ login เห็นหน้าแรกตาม mockup
  - [ ] ผู้เยี่ยมชมเห็นหน้าแรกอย่างเดียว (ผู้ใช้ตัดสินใจ 17 พ.ย.) ทุก route อื่นรวม `/profile`, `/templates`, `/courses`, `/lab` พาไป Login ไม่แสดงการ์ด GuestProfile
  - [ ] กดเข้า route ที่ต้อง login แล้วถูกพาไป Login และกลับมาหน้าที่ตั้งใจหลัง login สำเร็จ
  - [ ] บัญชีที่ถูกแบนยังถูกกันเหมือนเดิม
- ตรวจ: FE, `pytest tests/test_auth.py`, ทดสอบ flow login/logout ในเบราว์เซอร์
- ขึ้นกับ: T6
- ไฟล์: `src/platform/pages/GuestHome.tsx`, `src/components/LoginPage.tsx`, `src/components/AuthGate.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering` + `security-and-hardening` (รับเฉพาะ path ภายในแอปตอนพากลับหลัง login กัน open redirect)
- ผู้ทำ: Sonnet subagent (medium) · ชุด A · ตัวหลักตรวจ diff ทันทีหลังจบ (open redirect)

### จุดตรวจ 1
- [ ] agent: `agent-skills:code-reviewer` เน้นว่า `/lab` ไม่พัง
- [ ] BE, FE, LAB ผ่าน
- [ ] Login ด้วย Google แล้วเห็นเมนูตามสิทธิ์จริง
- [ ] ตารางเทียบ: แถวส่วนร่วมและหน้าแรกเปลี่ยนเป็น `ย้ายแล้ว`
- [ ] **ให้ผู้ใช้ดูก่อนไประยะ 2**

---

## ระยะ 2: หน้าที่ใช้ข้อมูลจริง

### [ ] T8 เพิ่ม `users.can_teach`
เพิ่มคอลัมน์ ส่งค่าใน `/api/auth/me` และ `/api/admin/users` และให้ admin แก้ได้พร้อมบันทึก audit log

- เกณฑ์รับ
  - [ ] ผู้ใช้เดิมทั้ง 4 แถวได้ `can_teach = false` และข้อมูลอื่นไม่เปลี่ยน
  - [ ] `PATCH /api/admin/users/{id}` รับ `can_teach` ได้เฉพาะ admin และเกิด log `permission.can_teach_update`
  - [ ] ผู้ใช้ธรรมดาเรียกแล้วได้ 403
- ตรวจ: BE (เพิ่มเทสต์ใน `tests/test_admin_users.py` ทั้งกรณีอนุญาตและไม่อนุญาต), รัน T1 snapshot เทียบว่าแถวเดิมไม่เปลี่ยน
- ขึ้นกับ: T1
- ไฟล์: `server/models.py`, `server/main.py`, `server/schemas.py`, `server/routers/admin.py`, `tests/test_admin_users.py`
- ขนาด: M
- skill: `api-and-interface-design` + `test-driven-development` + `deprecation-and-migration`
- ผู้ทำ: Opus subagent (high) · ชุด B

### [ ] T8.1 สิทธิ์ Official template ตามบทบาท และการลบ template
ใช้ตารางสิทธิ์ใน plan.md (การตัดสินใจข้อ 7): admin ทำได้ทุกอย่าง, ผู้สอน (`can_teach`) สร้าง/ตั้งเป็น Official และแก้/ลบ Official ได้ แต่เปิดปิดความคิดเห็นไม่ได้, ผู้เรียนทำไม่ได้

เพิ่ม `DELETE /api/templates/{id}` แบบ soft delete (คอลัมน์ `templates.deleted_at` ค่าเริ่มต้น NULL) ตอนนี้ server ไม่มีทางลบ template เลย (ผู้ใช้ตัดสินใจ 17 พ.ย.)

- เกณฑ์รับ
  - [ ] ผู้สอนสร้าง template แบบ Official ได้ และแก้ชื่อ คำอธิบาย ปก และ workflow ของ Official ได้
  - [ ] ผู้สอนเปิดปิดความคิดเห็นของ Official ไม่ได้ (403) ส่วน admin ทำได้เหมือนเดิม
  - [ ] ผู้เรียนสร้างหรือแก้ Official ไม่ได้ (403) และ template ของตัวเองยังทำงานเหมือนเดิม
  - [ ] เพิ่มคอลัมน์ `templates.deleted_at` ด้วย ALTER เดิมใน `main.py` (ทดสอบกับ SQLite ก่อน) แถวเดิมทั้ง 13 แถวได้ `deleted_at = NULL` และข้อมูลอื่นไม่เปลี่ยน
  - [ ] `DELETE /api/templates/{id}` เป็น soft delete: admin และผู้สอนลบ Official ได้, ผู้เรียนลบ Official ไม่ได้ (403), เจ้าของ template ทั่วไป (Private/Public) ลบของตัวเองได้, คนอื่นลบไม่ได้ (403)
  - [ ] แถวที่ลบไม่แสดงในทุกรายการ (`/api/templates`, `/official`, `/mine`) และเปิด/โหลด/คอมเมนต์ไม่ได้ (404)
  - [ ] seed (`ensure_official_template_records`) ไม่สร้าง Official ที่ถูกลบกลับมา และไม่เติม workflow ให้แถวที่ลบ
  - [ ] ทุกการลบถูกบันทึกใน audit log (`template.delete`) พร้อมผู้ลบและ id
- ตรวจ: BE (เพิ่มเทสต์ทั้ง 3 บทบาท รวมกรณีลบและกรณี seed หลังลบ ใน `tests/test_templates_api.py`), รัน T1 snapshot เทียบว่าแถวเดิมไม่เปลี่ยน, FE ปุ่มแก้ไขแสดงตามสิทธิ์
- ขึ้นกับ: T8
- ไฟล์: `server/models.py`, `server/main.py`, `server/routers/templates.py`, `server/official_templates.py`, `server/schemas.py`, `tests/test_templates_api.py`, `src/components/TemplatePlatformLibrary.tsx`, `src/lib/templateApi.ts`
- ขนาด: L (แยก commit สิทธิ์ Official กับการลบ)
- skill: `test-driven-development` + `security-and-hardening` + `doubt-driven-development` + `deprecation-and-migration` (คอลัมน์ `deleted_at`)
- ผู้ทำ: Opus subagent (high) · ชุด B

### [ ] T9 หน้า Users ด้วยผู้ใช้จริง
ย้ายหน้า `AdminUsers` ของ mockup และรวมความสามารถของ `AdminUserPanel` เดิม

- เกณฑ์รับ
  - [ ] ตารางแสดงผู้ใช้จริงครบทุกแถวจาก `/api/admin/users` พร้อมค้นหา
  - [ ] มีสวิตช์สิทธิ์ผู้สอน และยังเปลี่ยน role กับแบนแบบกำหนดวันหมดอายุได้เหมือนเดิม
  - [ ] ผู้ใช้ธรรมดาเปิด `/users` ไม่ได้
- ตรวจ: FE, จำนวนแถวบนจอเท่ากับ `select count(*) from users`
- ขึ้นกับ: T6, T8
- ไฟล์: `src/platform/pages/UsersPage.tsx`, `src/lib/adminApi.ts`, `src/components/AdminUserPanel.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด F

### [ ] T10 Audit log API: แบ่งหน้า ตัวกรอง และยอดรวม
ตอนนี้ดึงได้สูงสุด 500 แถวจาก 2,626 แถว (16 พ.ย.) เพิ่ม `offset`, ตัวกรอง `action`, คำค้น และคืนยอดรวม

- เกณฑ์รับ
  - [ ] ไล่ทุกหน้าแล้วได้ id ครบเท่ากับจำนวนแถวในฐานข้อมูล ไม่ซ้ำ ไม่ขาด
  - [ ] กรองตาม action และคำค้นทำที่ server
  - [ ] การเรียกแบบเดิม (`?limit=200`) ยังได้ผลเหมือนเดิม
- ตรวจ: BE (เพิ่มเทสต์ใน `tests/test_admin_audit_logs.py`)
- ขึ้นกับ: T1
- ไฟล์: `server/routers/admin.py`, `server/schemas.py`, `tests/test_admin_audit_logs.py`
- ขนาด: S
- skill: `api-and-interface-design` + `test-driven-development`
- ผู้ทำ: Sonnet subagent (medium) · ชุด C

### [ ] T11 หน้า Platform Logs ด้วย log จริง
ย้ายหน้า `PlatformLogs` และ `LogDetail` ใช้ป้ายชื่อ action จาก `AdminAuditLogView` เดิม

- เกณฑ์รับ
  - [ ] แสดงผู้กระทำ เวลา ประเภท เป้าหมาย และผลลัพธ์ (สำเร็จเมื่อ `status_code` < 400) จากข้อมูลจริง
  - [ ] ตัวกรองมี action ครบ 18 ชนิดที่มีในฐานข้อมูล และเลื่อนดูได้ถึงแถวแรกสุด
  - [ ] ยอดรวมบนจอเท่ากับจำนวนแถวใน `audit_logs`
- ตรวจ: FE, เทียบยอดรวมกับ SQL, เปิดรายละเอียด log `processing.run` หนึ่งรายการ
- ขึ้นกับ: T6, T10
- ไฟล์: `src/platform/pages/LogsPage.tsx`, `src/lib/adminApi.ts`, `src/components/AdminAuditLogView.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด C

### [ ] T12 หน้า Templates ด้วย template และคอมเมนต์จริง
ย้าย `TemplateLibrary` และ `TemplateDetail` ต่อกับ `templateApi.ts` แยกแท็บ Official / Public / ของฉัน

- เกณฑ์รับ
  - [ ] แสดง Official 9, Public และของฉันตามข้อมูลจริง พร้อมปก เจ้าของ เวลาแก้ไข และรายการโหนดของ workflow
  - [ ] เจ้าของแก้ชื่อ คำอธิบาย การมองเห็น และปกได้; admin เปิดปิดคอมเมนต์ได้; เขียนและลบคอมเมนต์ได้
  - [ ] template แบบ Private ของคนอื่นไม่ปรากฏ (ผู้ใช้ยืนยัน 17 พ.ย.: admin ก็ไม่เห็น Private ของคนอื่น)
  - [ ] แสดง template จริงของ VIPER จากฐานข้อมูลเท่านั้น: รวมทุกแท็บของทุกผู้ใช้ครอบคลุมแถวที่ไม่ถูกลบครบ (13 แถว ณ 17 พ.ย.) ไม่มี template ตัวอย่างของ mockup หลุดเข้ามา
  - [ ] ลบ template ผ่าน modal ยืนยัน (แถว C-14) ปุ่มลบแสดงตามสิทธิ์ของ T8.1
- ตรวจ: FE, `pytest tests/test_templates_api.py tests/test_comments_api.py`, เทียบจำนวนแต่ละแท็บกับ SQL (`deleted_at IS NULL`), ค้นใน `src/` ไม่พบชื่อ template ตัวอย่างของ mockup
- ขึ้นกับ: T6
- ไฟล์: `src/platform/pages/TemplatesPage.tsx`, `src/platform/TemplateDetail.tsx`, `src/lib/templateApi.ts`
- ขนาด: L (แยก detail กับ list เป็นสอง commit)
- skill: `frontend-ui-engineering` + `test-driven-development`
- ผู้ทำ: Sonnet subagent (medium) · ชุด D · ตัวหลักตรวจ diff ทันทีหลังจบ (ขนาด L)

### [ ] T13 เปิด template ใน Lab และบันทึก template จาก Lab
ปุ่ม "เปิดใน Lab" โหลด workflow เข้าแท็บใหม่ของ editor และย้าย `SaveTemplateDialog` มาใช้ใน Lab

- เกณฑ์รับ
  - [ ] เปิด Official template และ template ของผู้ใช้ได้โหนดและเส้นครบ (ทั้งสองแบบโหลดจากฐานข้อมูลผ่าน `POST /api/templates/{id}/load`)
  - [ ] บันทึกจาก Lab แล้วเห็นในแท็บ "ของฉัน" ทันที
  - [ ] เกิด log `template.load` และ `template.create` ตามเดิม
- ตรวจ: FE, LAB, เปิด template "Homography Estimation" แล้วรันผ่าน
- ขึ้นกับ: T12
- ไฟล์: `src/platform/SaveTemplateDialog.tsx`, `src/pages/LabPage.tsx`, `src/components/sidebar.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering` + `test-driven-development`
- ผู้ทำ: Sonnet subagent (medium) · ชุด D

### [ ] T14 คลังโหนดใน Lab ตามแบบ mockup ด้วยโหนดจริง
ปรับหัว Lab และคลัง (Nodes / Templates, เปิดปิดหมวด, ปุ่มสลับคลังปุ่มเดียว) ให้ตรง mockup โดยรายการมาจาก sidebar เดิม

- เกณฑ์รับ
  - [ ] คลังแสดงโหนดที่เปิดใช้ครบ 22 ชนิดใน 9 หมวด และลากลง canvas ได้ทุกตัว; 9 ชนิดที่ซ่อนยังไม่แสดง
  - [ ] ปิดคลังแล้วเปิดกลับได้ทั้งเดสก์ท็อปและ 375px โดยคลังไม่ทับหัว Lab
  - [ ] แผงโจทย์และปุ่มส่งงานไม่แสดง (ยังไม่มีกิจกรรม)
- ตรวจ: FE, LAB, นับรายการในคลังเทียบกับ `sidebarGroups()` ใน `src/lib/nodeCatalog.ts` (รายการคลังต้องมาจากฟังก์ชันนี้ ไม่เขียนรายการใหม่)
- ขึ้นกับ: T5, T13
- ไฟล์: `src/components/sidebar.tsx`, `src/pages/LabPage.tsx`, `src/platform/styles/lab.css`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด D

### [ ] T15 Endpoint ข้อมูลของผู้ใช้เอง
เพิ่ม `GET /api/me/activity` (audit log ของตัวเอง แบ่งหน้า) และ `GET /api/me/summary` (จำนวน template ของฉัน จำนวนการรัน เวลาใช้งานล่าสุด)

- เกณฑ์รับ
  - [ ] คืนเฉพาะแถวที่ `actor_id` เป็นของผู้เรียก
  - [ ] ตัวเลขใน summary ตรงกับ SQL
  - [ ] ไม่ login ได้ 401
- ตรวจ: BE (เทสต์ใหม่ `tests/test_me_api.py` รวมกรณีผู้ใช้สองคนไม่เห็นข้อมูลกัน)
- ขึ้นกับ: T1
- ไฟล์: `server/routers/me.py`, `server/main.py`, `server/schemas.py`, `tests/test_me_api.py`
- ขนาด: M
- skill: `api-and-interface-design` + `test-driven-development` + `security-and-hardening` (กันผู้ใช้เห็นข้อมูลของคนอื่น)
- ผู้ทำ: Sonnet subagent (medium) · ชุด E

### [ ] T16 หน้า Profile
ย้าย `AccountProfile` แสดงชื่อ อีเมล และรูปจาก Google แบบอ่านอย่างเดียว แท็บผลงานใช้ template ของฉัน แท็บประวัติใช้ `/api/me/activity`

- เกณฑ์รับ
  - [ ] ไม่มีช่องแก้อีเมล และไม่มีปุ่ม "นำเข้าจากอีเมลสาธิต"
  - [ ] จำนวนผลงานและประวัติตรงกับ T15
  - [ ] ส่วนงานที่ส่งแสดงสถานะว่าง
- ตรวจ: FE, เทียบตัวเลขกับ `/api/me/summary`
- ขึ้นกับ: T12, T15
- ไฟล์: `src/platform/pages/ProfilePage.tsx`, `src/lib/meApi.ts`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด E

### [ ] T17 Dashboard 3 แบบ
ย้าย `Dashboard`, `InstructorDashboard`, `AdminDashboard` ตัวเลขทั้งหมดมาจาก API จริง ส่วนคอร์สแสดงสถานะว่าง

- เกณฑ์รับ
  - [ ] Admin เห็นจำนวนผู้ใช้ template และเหตุการณ์จากข้อมูลจริง
  - [ ] ผู้ใช้ธรรมดาเห็น "การทดลองล่าสุด" จากการรันจริงของตัวเอง
  - [ ] ไม่มีตัวเลขหรือชื่อจากข้อมูลตัวอย่างของ mockup
- ตรวจ: FE, เทียบตัวเลขทุกช่องกับ SQL
- ขึ้นกับ: T9, T11, T15
- ไฟล์: `src/platform/pages/DashboardPage.tsx`, `src/platform/pages/AdminDashboard.tsx`, `src/platform/pages/InstructorDashboard.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด E

### จุดตรวจ 2
- [ ] agent: `agent-skills:code-reviewer`, `agent-skills:test-engineer`, `agent-skills:security-auditor` (ขอบเขต T8, T8.1, T15)
- [ ] BE, FE, LAB ผ่าน
- [ ] รัน `scripts/verify_migration.py` รอบแรก ผ่านข้อ 1 และข้อ 2
- [ ] ค้นใน `src/` ไม่พบชื่อบัญชีตัวอย่างของ mockup (`John Doe`, `อริศรา`, `example.edu`)
- [ ] **ให้ผู้ใช้ดูก่อนไประยะ 3**

---

## ระยะ 3: ส่วนที่ปล่อยว่าง

### [ ] T18 `learningApi.ts` ที่คืนรายการว่าง
ไฟล์เดียวที่เป็นแหล่งข้อมูลของคอร์ส บทเรียน งานที่ส่ง คะแนน ประกาศ และการแจ้งเตือน พร้อม type ที่ตรงกับโครงข้อมูลของ mockup

- เกณฑ์รับ
  - [ ] ทุกฟังก์ชันคืนรายการว่างและมี type ครบ
  - [ ] ไม่มีหน้าใดอ่านข้อมูลกลุ่มนี้จากที่อื่น
- ตรวจ: FE
- ขึ้นกับ: T5
- ไฟล์: `src/lib/learningApi.ts`, `src/platform/types.ts`
- ขนาด: S
- skill: `api-and-interface-design` (ไฟล์นี้เป็นจุดต่อกับระบบคอร์สรอบหน้า)
- ผู้ทำ: Sonnet subagent (medium) · ชุด G

### [ ] T19 หน้า Courses, Course, Lesson, Teach แบบว่าง
ย้ายโครงหน้า `CourseCatalog`, `CoursePage`, `LessonPage`, `TeachHome` ให้แสดงสถานะว่างที่บอกว่าจะเพิ่มภายหลัง

- เกณฑ์รับ
  - [ ] `/courses` แสดงหัวข้อและข้อความว่างตามแบบ mockup
  - [ ] ผู้ที่ไม่มี `can_teach` เปิดหน้า Teach แล้วเห็นข้อความ "ต้องได้รับสิทธิ์ผู้สอน"
  - [ ] ปุ่มสร้างคอร์สและตัวออกแบบ Lab ไม่เปิดใช้ และบันทึกในตารางเทียบว่า `ว่างตามแผน`
- ตรวจ: FE, เปิดทุก route ตรวจ console ไม่มี error
- ขึ้นกับ: T18
- ไฟล์: `src/platform/pages/CoursesPage.tsx`, `src/platform/pages/TeachPage.tsx`, `src/routes.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด G

### [ ] T20 หน้า Submissions, Grades, Announcements และกระดิ่งแบบว่าง
ย้ายโครง `SubmissionsHub`, `LearningHistory`, `Reviews`, `Gradebook`, `Announcements` และรายการแจ้งเตือน

- เกณฑ์รับ
  - [ ] แต่ละหน้าแสดงหัวข้อ แท็บสลับ และสถานะว่าง
  - [ ] ไม่มีงานตัวอย่าง คะแนน หรือการแจ้งเตือนตัวอย่างของ mockup
- ตรวจ: FE, เปิดทุก route ด้วยบัญชี admin และบัญชีธรรมดา
- ขึ้นกับ: T18
- ไฟล์: `src/platform/pages/SubmissionsPage.tsx`, `src/platform/pages/AnnouncementsPage.tsx`, `src/platform/Header.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด G

### จุดตรวจ 3
- [ ] agent: `agent-skills:code-reviewer`
- [ ] ทุก route ในตารางเทียบเปิดได้ ไม่มีหน้าขาวหรือ error ใน console
- [ ] BE, FE, LAB ผ่าน

---

## ระยะ 4: ยืนยันความครบถ้วน

### [ ] T21 สคริปต์ตรวจข้อมูล
เทียบฐานข้อมูลกับ snapshot, API กับฐานข้อมูล และรายการในโค้ด frontend ตามที่ระบุใน plan.md

- เกณฑ์รับ
  - [ ] แถวเดิมทุกแถวจาก snapshot ยังอยู่และ hash เท่าเดิม (ไม่นับคอลัมน์ที่เปลี่ยนตามการใช้งานและ `can_teach`)
  - [ ] จำนวนและชุด id จาก API ของ Users, Templates (3 แท็บ, เฉพาะ `deleted_at IS NULL`), Comments, Logs (รวมทุกหน้า) เท่ากับฐานข้อมูล
  - [ ] แถวที่ถูก soft delete ยังอยู่ในฐานข้อมูลและ hash ตรง snapshot (ไม่นับ `deleted_at`)
  - [ ] โหนดที่เปิดใช้ 22 ชนิดใน `nodeCatalog.ts` อยู่ในคลังครบ และรายการที่เปิดใช้ 9 รายการใน `server/official_templates.json` ตรงกับแถว Official ที่มี workflow; ผลออกเป็น `outputs/parity-report/data.json`
- ตรวจ: รันสคริปต์แล้วทุกข้อเป็น PASS; ทดลองลบคอมเมนต์ทดสอบหนึ่งรายการแล้วสคริปต์ต้องรายงานผิด
- ขึ้นกับ: T1, ระยะ 2 ทั้งหมด
- ไฟล์: `scripts/verify_migration.py`
- ขนาด: M
- skill: `test-driven-development` (สคริปต์ต้องจับความผิดที่ใส่ไว้ได้)
- ผู้ทำ: Opus subagent (high) · ชุด H

### [ ] T22 รายงานภาพเทียบ mockup กับของจริง
ถ่ายของจริงทุกแถวในตารางเทียบ แล้วสร้างหน้ารายงานวางคู่กับภาพ mockup จาก T2

- เกณฑ์รับ
  - [ ] `outputs/parity-report/index.html` มีทุกแถวของตารางเทียบ: ภาพ mockup, ภาพของจริง, สถานะ, แหล่งข้อมูล, หมายเหตุ ที่ 1440 และ 375
  - [ ] ส่วนบนของรายงานสรุปจำนวนแถวแต่ละสถานะ และผลจาก `data.json`
  - [ ] แถวที่ `ว่างตามแผน` หรือ `ตัดออก` มีป้ายและเหตุผลชัดเจน
- ตรวจ: เปิดรายงานในเบราว์เซอร์ ไม่มีภาพเสีย จำนวนแถวเท่ากับตารางเทียบ
- ขึ้นกับ: T2, T21, ต้องมี session ที่ผู้ใช้ login ไว้ (admin และบัญชีธรรมดา)
- ไฟล์: `scripts/parity_screenshots.py`, `scripts/build_parity_report.mjs`
- ขนาด: M
- skill: `webapp-testing` (ใช้ `storage_state` เก็บ session ที่ login แล้ว)
- ผู้ทำ: Sonnet subagent (medium) · ชุด I2 · ตัวหลักเตรียม session ที่ login แล้วให้ก่อน

### [ ] T23 ตรวจความสามารถเดิมของ editor และระบบ admin
ไล่ส่วนที่สองของตารางเทียบ (ของจริง → mockup) ทีละข้อ

- เกณฑ์รับ
  - [ ] ผ่านครบ: แท็บหลายแท็บ, undo/redo, hotkey, Save/Load ไฟล์ workflow, Log panel, หน้าข้อมูลอัลกอริทึม, รันทีละโหนดและรันทั้งหมด, หยุดการรัน
  - [ ] ผ่านครบ: แบนแบบมีวันหมดอายุ, เปลี่ยน role, อัปโหลดปก template, ลบคอมเมนต์
  - [ ] Official template ทั้ง 9 รายการเปิดได้ และรันผ่านอย่างน้อย ORB, Otsu, PSNR, Homography
  - [ ] หน้า "About Algorithm" ยังเปิดได้เมื่อเปิดรายการ template แบบเก่า (ค่าคงที่จาก T3) และกลุ่มโหนดที่ซ่อนเปิดกลับได้ด้วย `enabled` ใน `NODE_GROUPS`
- ตรวจ: BE, บันทึกผลรายข้อใน `tasks/parity.md`
- ขึ้นกับ: ระยะ 3
- ไฟล์: `tasks/parity.md`
- ขนาด: S
- skill: `anthropic-skills:built-in-browser`
- ผู้ทำ: Opus ตัวหลัก (high) ทำเอง

### [ ] T24 ตรวจจอ 375px ธีมมืด และการใช้คีย์บอร์ด
ตรวจทุกหน้าใหม่ตามเกณฑ์ที่ mockup ผ่านมาแล้ว

- เกณฑ์รับ
  - [ ] ทุกหน้าที่ 375px ไม่มีแนวนอนล้นจอ
  - [ ] ธีมมืดอ่านได้ทุกหน้า ไม่มีสีที่เขียนตายตัวหลุด
  - [ ] ใช้ Tab ไปถึงทุกปุ่ม เห็น focus ชัด และ modal ปิดด้วย Escape
- ตรวจ: วัด `scrollWidth` เทียบ `clientWidth` ทุก route ด้วยสคริปต์, ไล่ Tab ด้วยมือในหน้า Templates และ Users
- ขึ้นกับ: ระยะ 3
- ไฟล์: แก้เฉพาะจุดที่พบ
- ขนาด: S–M
- skill: `impeccable` (โหมด audit อย่างเดียว) + `anthropic-skills:built-in-browser`
- ผู้ทำ: Opus ตัวหลัก (high) ทำเอง

### [ ] T25 ปิดตารางเทียบและสรุปผล
อัปเดตสถานะทุกแถว สร้างรายงานรอบสุดท้าย และเขียนสรุปสิ่งที่ยังไม่ทำ

- เกณฑ์รับ
  - [ ] ตารางเทียบไม่มีแถว `ยังไม่ทำ`
  - [ ] รายงานรอบสุดท้ายสร้างหลัง commit สุดท้าย และผลข้อมูลเป็น PASS ทั้งหมด
  - [ ] มีรายการงานรอบถัดไป (ระบบคอร์ส บทเรียนทดสอบ การแจ้งเตือน) ใน `tasks/plan.md`
- ตรวจ: BE, FE, LAB รอบสุดท้าย
- ขึ้นกับ: T21–T24
- ไฟล์: `tasks/parity.md`, `tasks/plan.md`
- ขนาด: S
- skill: `documentation-and-adrs`
- ผู้ทำ: Opus ตัวหลัก (high) ทำเอง

### จุดตรวจสุดท้าย
- [ ] agent: `agent-skills:code-reviewer`, `agent-skills:test-engineer`, `agent-skills:security-auditor` + `/code-review` กับ diff ทั้ง branch
- [ ] BE ล้มไม่เกิน 15 รายการเดิม, FE ไม่มี error
- [ ] `verify_migration.py` เป็น PASS ทุกข้อ
- [ ] ผู้ใช้เปิด `outputs/parity-report/index.html` แล้วอนุมัติ
- [ ] ยังไม่ merge เข้า `main` จนกว่าผู้ใช้จะอนุมัติ
