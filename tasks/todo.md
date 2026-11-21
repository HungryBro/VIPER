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

### [x] T4 เพิ่ม router และย้าย editor เดิมไปที่ `/lab`
ติดตั้ง `react-router-dom` แยก editor ปัจจุบันออกจาก `App.tsx` เป็นหน้า `LabPage` และสร้าง layout กลางที่มีที่ว่างสำหรับ header

- เกณฑ์รับ
  - [x] `/lab` แสดง editor เดิมครบ: แท็บ Workflow, sidebar, ปุ่มรัน/หยุด, Log panel
  - [x] refresh ที่ `/lab` แล้วแท็บและ workflow เดิมยังอยู่ (`n2n_app_tabs`)
  - [x] route ที่ยังไม่ทำแสดงหน้า "ยังไม่พร้อม" ไม่ใช่หน้าขาว
- ตรวจ: FE, LAB, ทดสอบ undo/redo และ hotkey ลบโหนด
- ขึ้นกับ: T3
- ไฟล์: `package.json`, `src/main.tsx`, `src/App.tsx`, `src/pages/LabPage.tsx`, `src/routes.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering` + `react-router` (ภายนอก) + `source-driven-development` ตรวจด้วย `anthropic-skills:built-in-browser` · ติดตั้งแล้ว 16 พ.ย. ที่ `~/.agents/skills/react-router`
- ผู้ทำ: Opus ตัวหลัก (high) ทำเอง (โครงที่ทุก task ต้องพึ่ง)

### [x] T5 ย้าย CSS และ component พื้นฐานของ mockup
คัดลอก `Theme.css`, `Density.css`, `Platform.css`, `Learning.css` มาครอบ scope `.viper-platform` และแปลง `ui.jsx` เป็น TypeScript

- เกณฑ์รับ
  - [x] `Button`, `Badge`, `Empty`, `Modal`, `Markdown` ใช้ได้ใน TSX และ Modal ยังปิดด้วย Escape, กัก focus และคืน focus
  - [x] ธีมสว่าง/มืดทำงานด้วย token ชุดเดียว
  - [x] หน้า `/lab` ไม่มี style ใดเปลี่ยน (เทียบภาพก่อนและหลัง)
- ตรวจ: FE, LAB, เทียบภาพ `/lab` ก่อนและหลังที่ 1440 และ 375
- ขึ้นกับ: T4
- ไฟล์: `src/platform/styles/*.css`, `src/platform/ui.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด A

### [x] T6 Header: เมนูตามสิทธิ์จริง ธีม เมนูบัญชี กระดิ่ง
ย้าย `PlatformHeader` มาใช้ข้อมูลจาก `useAuth()` เมนูขึ้นตาม `role` และ `can_teach` (ก่อน T8 ให้ถือว่า `can_teach` เป็น false)

- เกณฑ์รับ
  - [x] ผู้ใช้ธรรมดาเห็น Dashboard, Courses, Templates, My Submissions, Lab; admin เห็น Users และ Platform Logs เพิ่ม
  - [x] ไม่มีปุ่มสลับบัญชีสาธิต; Logout เรียก `/api/auth/logout` จริง
  - [x] กระดิ่งเปิดได้และแสดงสถานะว่าง ไม่มีตัวเลขค้าง
- ตรวจ: FE, login ด้วยบัญชี admin และบัญชีธรรมดาแล้วเทียบเมนูกับแถว header ในตารางเทียบ
- ขึ้นกับ: T5
- ไฟล์: `src/platform/Header.tsx`, `src/platform/Layout.tsx`, `src/components/UserMenu.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด A

### [x] T7 หน้าแรกผู้เยี่ยมชมและหน้า Login
ย้าย `GuestHome`, `GuestHeader` และหน้า Login โดยเหลือปุ่ม Google ปุ่มเดียว ปรับ `AuthGate` ให้หน้าแรกเปิดได้โดยไม่ต้อง login

- เกณฑ์รับ
  - [x] เปิด `/` โดยไม่ login เห็นหน้าแรกตาม mockup
  - [x] ผู้เยี่ยมชมเห็นหน้าแรกอย่างเดียว (ผู้ใช้ตัดสินใจ 17 พ.ย.) ทุก route อื่นรวม `/profile`, `/templates`, `/courses`, `/lab` พาไป Login ไม่แสดงการ์ด GuestProfile
  - [x] กดเข้า route ที่ต้อง login แล้วถูกพาไป Login และกลับมาหน้าที่ตั้งใจหลัง login สำเร็จ
  - [x] บัญชีที่ถูกแบนยังถูกกันเหมือนเดิม
- ตรวจ: FE, `pytest tests/test_auth.py`, ทดสอบ flow login/logout ในเบราว์เซอร์
- ขึ้นกับ: T6
- ไฟล์: `src/platform/pages/GuestHome.tsx`, `src/components/LoginPage.tsx`, `src/components/AuthGate.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering` + `security-and-hardening` (รับเฉพาะ path ภายในแอปตอนพากลับหลัง login กัน open redirect)
- ผู้ทำ: Sonnet subagent (medium) · ชุด A · ตัวหลักตรวจ diff ทันทีหลังจบ (open redirect)

### จุดตรวจ 1
- [x] agent: `agent-skills:code-reviewer` เน้นว่า `/lab` ไม่พัง
- [x] BE, FE, LAB ผ่าน
- [x] Login ด้วย Google แล้วเห็นเมนูตามสิทธิ์จริง (admin ตรวจด้วยบัญชีจริง, ผู้ใช้ธรรมดาตรวจด้วยการจำลอง `/api/auth/me` เพราะยังไม่มีบัญชีธรรมดาใน browser)
- [x] ตารางเทียบ: แถวส่วนร่วมและหน้าแรกเปลี่ยนเป็น `ย้ายแล้ว`
- [ ] **ให้ผู้ใช้ดูก่อนไประยะ 2**

---

## ระยะ 2: หน้าที่ใช้ข้อมูลจริง

### [x] T8 เพิ่ม `users.can_teach`
เพิ่มคอลัมน์ ส่งค่าใน `/api/auth/me` และ `/api/admin/users` และให้ admin แก้ได้พร้อมบันทึก audit log

- เกณฑ์รับ
  - [x] ผู้ใช้เดิมทั้ง 4 แถวได้ `can_teach = false` และข้อมูลอื่นไม่เปลี่ยน
  - [x] `PATCH /api/admin/users/{id}` รับ `can_teach` ได้เฉพาะ admin และเกิด log `permission.can_teach_update`
  - [x] ผู้ใช้ธรรมดาเรียกแล้วได้ 403
- ตรวจ: BE (เพิ่มเทสต์ใน `tests/test_admin_users.py` ทั้งกรณีอนุญาตและไม่อนุญาต), รัน T1 snapshot เทียบว่าแถวเดิมไม่เปลี่ยน
- ขึ้นกับ: T1
- ไฟล์: `server/models.py`, `server/main.py`, `server/schemas.py`, `server/routers/admin.py`, `tests/test_admin_users.py`
- ขนาด: M
- skill: `api-and-interface-design` + `test-driven-development` + `deprecation-and-migration`
- ผู้ทำ: Opus subagent (high) · ชุด B

### [x] T8.1 สิทธิ์ Official template ตามบทบาท และการลบ template
ใช้ตารางสิทธิ์ใน plan.md (การตัดสินใจข้อ 7): admin ทำได้ทุกอย่าง, ผู้สอน (`can_teach`) สร้าง/ตั้งเป็น Official และแก้/ลบ Official ได้ แต่เปิดปิดความคิดเห็นไม่ได้, ผู้เรียนทำไม่ได้

เพิ่ม `DELETE /api/templates/{id}` แบบ soft delete (คอลัมน์ `templates.deleted_at` ค่าเริ่มต้น NULL) ตอนนี้ server ไม่มีทางลบ template เลย (ผู้ใช้ตัดสินใจ 17 พ.ย.)

- เกณฑ์รับ
  - [x] ผู้สอนสร้าง template แบบ Official ได้ และแก้ชื่อ คำอธิบาย ปก และ workflow ของ Official ได้
  - [x] ผู้สอนเปิดปิดความคิดเห็นของ Official ไม่ได้ (403) ส่วน admin ทำได้เหมือนเดิม
  - [x] ผู้เรียนสร้างหรือแก้ Official ไม่ได้ (403) และ template ของตัวเองยังทำงานเหมือนเดิม
  - [x] เพิ่มคอลัมน์ `templates.deleted_at` ด้วย ALTER เดิมใน `main.py` (ทดสอบกับ SQLite ก่อน) แถวเดิมทั้ง 13 แถวได้ `deleted_at = NULL` และข้อมูลอื่นไม่เปลี่ยน
  - [x] `DELETE /api/templates/{id}` เป็น soft delete: admin และผู้สอนลบ Official ได้, ผู้เรียนลบ Official ไม่ได้ (403), เจ้าของ template ทั่วไป (Private/Public) ลบของตัวเองได้, คนอื่นลบไม่ได้ (403)
  - [x] แถวที่ลบไม่แสดงในทุกรายการ (`/api/templates`, `/official`, `/mine`) และเปิด/โหลด/คอมเมนต์ไม่ได้ (404)
  - [x] seed (`ensure_official_template_records`) ไม่สร้าง Official ที่ถูกลบกลับมา และไม่เติม workflow ให้แถวที่ลบ
  - [x] ทุกการลบถูกบันทึกใน audit log (`template.delete`) พร้อมผู้ลบและ id
- ตรวจ: BE (เพิ่มเทสต์ทั้ง 3 บทบาท รวมกรณีลบและกรณี seed หลังลบ ใน `tests/test_templates_api.py`), รัน T1 snapshot เทียบว่าแถวเดิมไม่เปลี่ยน, FE ปุ่มแก้ไขแสดงตามสิทธิ์
- ขึ้นกับ: T8
- ไฟล์: `server/models.py`, `server/main.py`, `server/routers/templates.py`, `server/official_templates.py`, `server/schemas.py`, `tests/test_templates_api.py`, `src/components/TemplatePlatformLibrary.tsx`, `src/lib/templateApi.ts`
- ขนาด: L (แยก commit สิทธิ์ Official กับการลบ)
- skill: `test-driven-development` + `security-and-hardening` + `doubt-driven-development` + `deprecation-and-migration` (คอลัมน์ `deleted_at`)
- ผู้ทำ: Opus subagent (high) · ชุด B

### [x] T9 หน้า Users ด้วยผู้ใช้จริง
ย้ายหน้า `AdminUsers` ของ mockup และรวมความสามารถของ `AdminUserPanel` เดิม

- เกณฑ์รับ
  - [x] ตารางแสดงผู้ใช้จริงครบทุกแถวจาก `/api/admin/users` พร้อมค้นหา
  - [x] มีสวิตช์สิทธิ์ผู้สอน และยังเปลี่ยน role กับแบนแบบกำหนดวันหมดอายุได้เหมือนเดิม
  - [x] ผู้ใช้ธรรมดาเปิด `/users` ไม่ได้
- ตรวจ: FE, จำนวนแถวบนจอเท่ากับ `select count(*) from users`
- ขึ้นกับ: T6, T8
- ไฟล์: `src/platform/pages/UsersPage.tsx`, `src/lib/adminApi.ts`, `src/components/AdminUserPanel.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด F

### [x] T10 Audit log API: แบ่งหน้า ตัวกรอง และยอดรวม
ตอนนี้ดึงได้สูงสุด 500 แถวจาก 2,626 แถว (16 พ.ย.) เพิ่ม `offset`, ตัวกรอง `action`, คำค้น และคืนยอดรวม

- เกณฑ์รับ
  - [x] ไล่ทุกหน้าแล้วได้ id ครบเท่ากับจำนวนแถวในฐานข้อมูล ไม่ซ้ำ ไม่ขาด
  - [x] กรองตาม action และคำค้นทำที่ server
  - [x] การเรียกแบบเดิม (`?limit=200`) ยังได้ผลเหมือนเดิม
- ตรวจ: BE (เพิ่มเทสต์ใน `tests/test_admin_audit_logs.py`)
- ขึ้นกับ: T1
- ไฟล์: `server/routers/admin.py`, `server/schemas.py`, `tests/test_admin_audit_logs.py`
- ขนาด: S
- skill: `api-and-interface-design` + `test-driven-development`
- ผู้ทำ: Sonnet subagent (medium) · ชุด C

### [x] T11 หน้า Platform Logs ด้วย log จริง
ย้ายหน้า `PlatformLogs` และ `LogDetail` ใช้ป้ายชื่อ action จาก `AdminAuditLogView` เดิม

- เกณฑ์รับ
  - [x] แสดงผู้กระทำ เวลา ประเภท เป้าหมาย และผลลัพธ์ (สำเร็จเมื่อ `status_code` < 400) จากข้อมูลจริง
  - [x] ตัวกรองมี action ครบทุกชนิดที่มีในฐานข้อมูล (แผนเขียน 18 ชนิดเมื่อ 16 พ.ย. ณ 17 พ.ย. มี 20 ชนิด ตัวกรองดึงจาก `/api/admin/audit-logs/actions`) และเลื่อนดูได้ถึงแถวแรกสุด
  - [x] ยอดรวมบนจอเท่ากับจำนวนแถวใน `audit_logs`
- ตรวจ: FE, เทียบยอดรวมกับ SQL, เปิดรายละเอียด log `processing.run` หนึ่งรายการ
- ขึ้นกับ: T6, T10
- ไฟล์: `src/platform/pages/LogsPage.tsx`, `src/lib/adminApi.ts`, `src/components/AdminAuditLogView.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด C

### [x] T12 หน้า Templates ด้วย template และคอมเมนต์จริง
ย้าย `TemplateLibrary` และ `TemplateDetail` ต่อกับ `templateApi.ts` แยกแท็บ Official / Public / ของฉัน

- เกณฑ์รับ
  - [x] แสดง Official 9, Public และของฉันตามข้อมูลจริง พร้อมปก เจ้าของ เวลาแก้ไข และรายการโหนดของ workflow
  - [x] เจ้าของแก้ชื่อ คำอธิบาย การมองเห็น และปกได้; admin เปิดปิดคอมเมนต์ได้; เขียนและลบคอมเมนต์ได้
  - [x] template แบบ Private ของคนอื่นไม่ปรากฏในรายการ (รวม admin; admin เปิดด้วย id ได้ตามพฤติกรรมเดิม ดู plan.md ข้อ 8)
  - [x] แสดง template จริงของ VIPER จากฐานข้อมูลเท่านั้น: รวมทุกแท็บของทุกผู้ใช้ครอบคลุมแถวที่ไม่ถูกลบครบ (13 แถว ณ 17 พ.ย.) ไม่มี template ตัวอย่างของ mockup หลุดเข้ามา
  - [x] ลบ template ผ่าน modal ยืนยัน (แถว C-14) ปุ่มลบแสดงตามสิทธิ์ของ T8.1
- ตรวจ: FE, `pytest tests/test_templates_api.py tests/test_comments_api.py`, เทียบจำนวนแต่ละแท็บกับ SQL (`deleted_at IS NULL`), ค้นใน `src/` ไม่พบชื่อ template ตัวอย่างของ mockup
- ขึ้นกับ: T6
- ไฟล์: `src/platform/pages/TemplatesPage.tsx`, `src/platform/TemplateDetail.tsx`, `src/lib/templateApi.ts`
- ขนาด: L (แยก detail กับ list เป็นสอง commit)
- skill: `frontend-ui-engineering` + `test-driven-development`
- ผู้ทำ: Sonnet subagent (medium) · ชุด D · ตัวหลักตรวจ diff ทันทีหลังจบ (ขนาด L)

### [x] T13 เปิด template ใน Lab และบันทึก template จาก Lab
ปุ่ม "เปิดใน Lab" โหลด workflow เข้าแท็บใหม่ของ editor และย้าย `SaveTemplateDialog` มาใช้ใน Lab

- เกณฑ์รับ
  - [x] เปิด Official template และ template ของผู้ใช้ได้โหนดและเส้นครบ (ทั้งสองแบบโหลดจากฐานข้อมูลผ่าน `POST /api/templates/{id}/load`)
  - [x] บันทึกจาก Lab แล้วเห็นในแท็บ "ของฉัน" ทันที
  - [x] เกิด log `template.load` และ `template.create` ตามเดิม
- ตรวจ: FE, LAB, เปิด template "Homography Estimation" แล้วรันผ่าน
- ขึ้นกับ: T12
- ไฟล์: `src/platform/SaveTemplateDialog.tsx`, `src/pages/LabPage.tsx`, `src/components/sidebar.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering` + `test-driven-development`
- ผู้ทำ: Sonnet subagent (medium) · ชุด D

### [x] T14 คลังโหนดใน Lab ตามแบบ mockup ด้วยโหนดจริง
ปรับหัว Lab และคลัง (Nodes / Templates, เปิดปิดหมวด, ปุ่มสลับคลังปุ่มเดียว) ให้ตรง mockup โดยรายการมาจาก sidebar เดิม

- เกณฑ์รับ
  - [x] คลังแสดงโหนดที่เปิดใช้ครบ 22 ชนิดใน 9 หมวด และลากลง canvas ได้ทุกตัว; 9 ชนิดที่ซ่อนยังไม่แสดง
  - [x] ปิดคลังแล้วเปิดกลับได้ทั้งเดสก์ท็อปและ 375px โดยคลังไม่ทับหัว Lab
  - [x] แผงโจทย์และปุ่มส่งงานไม่แสดง (ยังไม่มีกิจกรรม)
- ตรวจ: FE, LAB, นับรายการในคลังเทียบกับ `sidebarGroups()` ใน `src/lib/nodeCatalog.ts` (รายการคลังต้องมาจากฟังก์ชันนี้ ไม่เขียนรายการใหม่)
- ขึ้นกับ: T5, T13
- ไฟล์: `src/components/sidebar.tsx`, `src/pages/LabPage.tsx`, `src/platform/styles/lab.css`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด D

### [x] T15 Endpoint ข้อมูลของผู้ใช้เอง
เพิ่ม `GET /api/me/activity` (audit log ของตัวเอง แบ่งหน้า) และ `GET /api/me/summary` (จำนวน template ของฉัน จำนวนการรัน เวลาใช้งานล่าสุด)

- เกณฑ์รับ
  - [x] คืนเฉพาะแถวที่ `actor_id` เป็นของผู้เรียก
  - [x] ตัวเลขใน summary ตรงกับ SQL
  - [x] ไม่ login ได้ 401
- ตรวจ: BE (เทสต์ใหม่ `tests/test_me_api.py` รวมกรณีผู้ใช้สองคนไม่เห็นข้อมูลกัน)
- ขึ้นกับ: T1
- ไฟล์: `server/routers/me.py`, `server/main.py`, `server/schemas.py`, `tests/test_me_api.py`
- ขนาด: M
- skill: `api-and-interface-design` + `test-driven-development` + `security-and-hardening` (กันผู้ใช้เห็นข้อมูลของคนอื่น)
- ผู้ทำ: Sonnet subagent (medium) · ชุด E

### [x] T16 หน้า Profile
ย้าย `AccountProfile` แสดงชื่อ อีเมล และรูปจาก Google แบบอ่านอย่างเดียว แท็บผลงานใช้ template ของฉัน แท็บประวัติใช้ `/api/me/activity`

- เกณฑ์รับ
  - [x] ไม่มีช่องแก้อีเมล และไม่มีปุ่ม "นำเข้าจากอีเมลสาธิต"
  - [x] จำนวนผลงานและประวัติตรงกับ T15
  - [x] ส่วนงานที่ส่งแสดงสถานะว่าง
- ตรวจ: FE, เทียบตัวเลขกับ `/api/me/summary`
- ขึ้นกับ: T12, T15
- ไฟล์: `src/platform/pages/ProfilePage.tsx`, `src/lib/meApi.ts`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด E

### [x] T17 Dashboard 3 แบบ
ย้าย `Dashboard`, `InstructorDashboard`, `AdminDashboard` ตัวเลขทั้งหมดมาจาก API จริง ส่วนคอร์สแสดงสถานะว่าง

- เกณฑ์รับ
  - [x] Admin เห็นจำนวนผู้ใช้ template และเหตุการณ์จากข้อมูลจริง
  - [x] ผู้ใช้ธรรมดาเห็น "การทดลองล่าสุด" จากการรันจริงของตัวเอง
  - [x] ไม่มีตัวเลขหรือชื่อจากข้อมูลตัวอย่างของ mockup
- ตรวจ: FE, เทียบตัวเลขทุกช่องกับ SQL
- ขึ้นกับ: T9, T11, T15
- ไฟล์: `src/platform/pages/DashboardPage.tsx`, `src/platform/pages/AdminDashboard.tsx`, `src/platform/pages/InstructorDashboard.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด E

### จุดตรวจ 2
- [x] agent: `agent-skills:code-reviewer`, `agent-skills:test-engineer`, `agent-skills:security-auditor` (ขอบเขต T8, T8.1, T15)
- [x] BE, FE, LAB ผ่าน
- [ ] รัน `scripts/verify_migration.py` รอบแรก ผ่านข้อ 1 และข้อ 2 (สคริปต์นี้สร้างใน T21 ซึ่งอยู่หลังจุดตรวจนี้ 18 พ.ย. ตรวจแทนด้วยมือ: แถวเดิมทุกตารางตรง snapshot T1, ตัวเลข API ของ Users/Templates/Logs/me ตรง SQL)
- [x] ค้นใน `src/` ไม่พบชื่อบัญชีตัวอย่างของ mockup (`John Doe`, `อริศรา`, `example.edu`)
- [ ] **ให้ผู้ใช้ดูก่อนไประยะ 3**

### แก้หลังจุดตรวจ 2
ผลจาก agent 3 ตัวที่จุดตรวจ 2 และการตัดสินใจของผู้ใช้ (21 พ.ย. 2569) ทำให้ครบก่อนไประยะ 3 ผู้ทำและการแบ่งชุดกำหนดตอนเริ่มแก้ ทุกข้อใช้ข้อห้าม 6 ข้อเดิม, `scripts/check.sh` ต้อง `CHECK PASS` และงานที่แตะ backend ต้อง restart backend ก่อนตรวจกับข้อมูลจริง (`--reload` ไม่โหลดโค้ดใหม่อย่างน่าเชื่อถือ) การตรวจในเบราว์เซอร์ที่คาดว่าจะถูกปฏิเสธ ต้องเช็ก `/api/auth/me` ก่อนทุกครั้ง

#### กลุ่ม A: บั๊กและเทสต์ที่ขาด (code-reviewer / test-engineer)

- [x] **A1 hotkey ของ Lab ทำงานอยู่หลัง modal** (Important) เปิด SAVE TEMPLATE หรือ "?" แล้วกด Backspace/Delete/Ctrl+Z/Ctrl+V ไปลบหรือ undo โหนดบน canvas ข้างหลัง
  - เกณฑ์รับ: ระหว่างที่ `SaveTemplateDialog` หรือ `LabHelpDialog` เปิดอยู่ hotkey ของ canvas ไม่ทำงาน (เช่น `enabled: active && !saveTemplateOpen && !helpOpen` หรือข้าม event ที่อยู่ใน `[role="dialog"]`) ; ปิด modal แล้ว hotkey กลับมาทำงาน ; พิมพ์/ลบข้อความในช่องชื่อของ dialog ได้ตามปกติ
  - ตรวจ: เลือกโหนด เปิด SAVE TEMPLATE กด Backspace, Delete, Ctrl+Z, Ctrl+V แล้วจำนวนโหนดไม่เปลี่ยน ; ปิด dialog แล้ว Delete ลบโหนดได้ ; ทำซ้ำกับปุ่ม "?"
  - ไฟล์: `src/pages/LabPage.tsx`, `src/FlowCanvas.tsx` หรือ `src/hooks/useFlowHotkeys.ts` (เพิ่มโค้ดอย่างเดียว)

- [x] **A2 หน้า Logs: ปุ่ม "โหลดเพิ่ม" ค้างเป็นกำลังโหลด** (Important) เมื่อเปลี่ยนตัวกรองหรือคำค้นระหว่างที่ "โหลดเพิ่ม" ยังไม่กลับ
  - เกณฑ์รับ: `load()` รีเซ็ต `loadingMore` ด้วย ; หลังเปลี่ยนตัวกรองระหว่างโหลดเพิ่ม ปุ่มกลับมากดได้และโหลดหน้าถัดไปของตัวกรองใหม่ถูกต้อง ไม่มีแถวของตัวกรองเก่าปน
  - ตรวจ: Playwright จำลอง API ที่ตอบช้า กด "โหลดเพิ่ม" แล้วเปลี่ยนตัวกรองทันที ปุ่มต้องไม่ disabled ค้าง และแถวทั้งหมดตรงตัวกรองใหม่
  - ไฟล์: `src/platform/pages/LogsPage.tsx`

- [x] **A3 "เปิดใน Lab" ระหว่างที่ pipeline รันอยู่ทำให้ pipeline ล้มและผลหาย** (Important) `handleLoadTemplate` สลับแท็บและ `restoreSnapshot` ทับ canvas ที่กำลังรัน
  - **ผู้ใช้เลือก (ข) (21 พ.ย. 2569)**: ถ้ามี pipeline รันอยู่ เปิด template เป็นแท็บใหม่ไว้เบื้องหลัง ไม่สลับออกจากแท็บที่กำลังรัน แจ้งผู้ใช้ว่าเปิดแท็บใหม่แล้ว ถ้าไม่มีงานรันอยู่ทำงานแบบเดิม (สลับไปแท็บใหม่)
  - เกณฑ์รับ: กด Start แล้วไปหน้า Templates กด "เปิดใน Lab" แล้ว pipeline เดิมไม่ล้ม ผลของทุกโหนดอยู่ในแท็บเดิม ไม่ไปแสดงบนแท็บใหม่ (รวมกรณีเปิด template เดิมที่ id โหนดซ้ำ) และ template ที่ขอเปิดได้แท็บของตัวเองตามวิธีที่เลือก ; ไม่ยิง `/load` ซ้ำ
  - ตรวจ: บัญชีจริง เปิด pipeline ที่ใช้เวลาหลายวินาที (ไม่ติดแคช) กด Start แล้วเปิด template จากหน้า Templates ทันที ดู log ว่าได้ "Pipeline Finished" และผลอยู่ครบในแท็บเดิม
  - ไฟล์: `src/pages/LabPage.tsx` (effect ของ labBridge), อาจรวม `src/platform/labBridge.ts`

- [x] **A4 ข้อย่อย**
  - [x] **A4a ยอดรวมเมื่อไม่มี header `X-Total-Count`**: `Number(null)` ได้ 0
    - เกณฑ์รับ: ถ้า header ไม่มี ใช้จำนวนแถวที่ได้แทน (หรือถือว่ายังมีหน้าถัดไปเมื่อได้เต็มหน้า) ไม่แสดง 0 และไม่ขึ้น "ถึงเหตุการณ์แรกสุดแล้ว" ผิด
    - ตรวจ: Playwright จำลอง response ที่ไม่มี header ทั้งหน้า Logs, Profile และ Dashboard
    - ไฟล์: `src/lib/adminApi.ts`, `src/lib/meApi.ts`
  - [x] **A4b เวลาแบนคำนวณตอนเปิด modal**: เปิดค้างแล้วระยะแบนสั้นลง และ BAN 1M ที่ค้างเกินนาทีได้ 422
    - เกณฑ์รับ: เก็บ `durationMs` ใน state แล้วคำนวณ `banned_until` ตอนกดยืนยัน
    - ตรวจ: Playwright ตั้งเวลาด้วย `page.clock` เปิด modal BAN 1M รอเกิน 1 นาทีแล้วยืนยัน body ที่ส่งมี `banned_until` เท่ากับเวลาที่กด + 1 นาที (ดักด้วย route ไม่ส่งถึง server จริง)
    - ไฟล์: `src/platform/pages/UsersPage.tsx`
  - [x] **A4c ประวัติในหน้า Profile แถวซ้ำ**: offset เลื่อนเมื่อมี log ใหม่ระหว่างกด "โหลดเพิ่ม"
    - เกณฑ์รับ: รวมหน้าด้วยการกันซ้ำตาม id แบบที่ LogsPage ทำ ไม่มี React key ซ้ำ
    - ตรวจ: Playwright จำลองหน้า 2 ที่มีแถวซ้ำกับหน้า 1 แล้วนับแถวบนจอ = จำนวน id ไม่ซ้ำ และ console ไม่มีคำเตือน key ซ้ำ
    - ไฟล์: `src/platform/pages/ProfilePage.tsx`
  - [x] **A4d template ที่ค้างใน labBridge ไม่ถูกล้างตอน logout**
    - เกณฑ์รับ: เมื่อ user เปลี่ยน (logout หรือ login คนอื่น) ค่า pending ใน labBridge ถูกล้าง ผู้ใช้คนถัดไปไม่ได้ template ของคนก่อน
    - ตรวจ: Playwright จำลอง push template แล้ว logout ก่อน 150ms login อีกบัญชีแล้วเปิด `/lab` ต้องไม่มีแท็บใหม่
    - ไฟล์: `src/platform/labBridge.ts` และจุดที่ฟังการเปลี่ยน user (เช่น `src/App.tsx` หรือ `AuthContext`)
  - [x] **A4e ปุ่ม UPDATE CANVAS ของ Official ทับ workflow โดยไม่ถาม**
    - เกณฑ์รับ: มีการยืนยันก่อนส่ง PATCH workflow (ข้อความบอกว่าเป็น Official ที่ทุกคนใช้) ยกเลิกแล้วไม่ส่งคำขอ ; ห้ามลบปุ่มหรือความสามารถเดิม
    - ตรวจ: Playwright จำลอง admin กด UPDATE CANVAS แล้วยกเลิก = 0 คำขอ PATCH, ยืนยัน = 1 คำขอ
    - ไฟล์: `src/components/TemplatePlatformLibrary.tsx`
  - [x] **A4f รายการ template ในคลังของ Lab ไม่รีเฟรช** หลังบันทึกผ่าน SAVE TEMPLATE หรือแก้/ลบที่หน้า Templates
    - เกณฑ์รับ: หลังบันทึกจาก Lab และเมื่อกลับมาที่ `/lab` หลังแก้หรือลบที่หน้า Templates รายการในคลังตรงกับ API ; กดโหลด template ที่ถูกลบไปแล้วไม่เกิด ; ถ้าเกิด 404 จากรายการเก่า แสดงข้อความและรีเฟรชรายการ
    - ตรวจ: Playwright จำลอง: บันทึกจาก Lab แล้วรายการใน Templates ของคลังมีชื่อใหม่ ; ลบที่หน้า Templates กลับ `/lab` แล้วรายการไม่มีแถวนั้น
    - ไฟล์: `src/pages/LabPage.tsx` (ส่ง `onSaved`), `src/components/TemplatePlatformLibrary.tsx` (เพิ่มการรีเฟรชอย่างเดียว)

- [x] **A5 เทสต์ที่ขาด** (test-engineer) เพิ่มเทสต์อย่างเดียว ไม่แก้พฤติกรรม ถ้าเทสต์ใหม่ล้มให้รายงานก่อนแก้โค้ด
  - [x] **A5a รายการ template ของ admin และผู้สอนไม่มี Private ของคนอื่น**: ผู้เรียนสร้าง Private แล้ว admin และผู้สอนเรียก `/api/templates`, `/official`, `/mine` ต้องไม่มี id นั้น ; ผู้สอนเรียก GET และ load Private ของผู้เรียนได้ 404
    - ตรวจ: เทสต์ใหม่ใน `tests/test_templates_api.py` ผ่าน
  - [x] **A5b `/api/me` ของ admin และผู้สอนเห็นเฉพาะของตัวเอง**: admin และผู้สอนมี log คนละ 1 แถวปนกับของผู้เรียน `X-Total-Count == "1"` และ summary นับเฉพาะของตัวเอง ; log ที่ admin กระทำต่อผู้เรียน (เช่น `ban.apply` ที่ `target_id` เป็นผู้เรียน) ไม่โผล่ในประวัติของผู้เรียน
    - ตรวจ: เทสต์ใหม่ใน `tests/test_me_api.py` ผ่าน
  - [x] **A5c ALTER ตรงกับชนิดคอลัมน์ของ PostgreSQL**: เทียบ SQL ใน `_ensure_user_columns`/`_ensure_template_columns` กับ DDL ที่ compile จาก model ด้วย `postgresql.dialect()` (`can_teach` → `BOOLEAN`, `deleted_at` → `TIMESTAMP WITH TIME ZONE`) ; อ่าน `deleted_at` หลัง ALTER ผ่าน ORM แล้วได้ datetime (ตรวจ tz ตามที่ dialect รองรับ)
    - ตรวจ: เทสต์ใหม่ใน `tests/test_schema_columns.py` ผ่าน โดยไม่ต้องมี PostgreSQL จริง
  - [x] **A5d ไล่หน้า audit log ที่มีแถว `actor_id` เป็น NULL**: seed บางแถวไม่มี actor แล้วไล่ทุกหน้าได้ id ครบ `X-Total-Count` ตรง และ `q` ที่ตรงกับ `request_path` ของแถวนั้นหาเจอ
    - ตรวจ: เทสต์ใหม่ใน `tests/test_admin_audit_logs.py` ผ่าน

#### กลุ่ม B: การตัดสินใจของผู้ใช้ (21 พ.ย. 2569)

- [x] **B1 ช่องโหว่อัปโหลดปก template (High, มีอยู่ก่อนแผนนี้ตั้งแต่ `f30c63b2`)** ตรวจชนิดไฟล์จากเนื้อหาจริง แล้วเปิดด้วย Pillow และบันทึกใหม่ (re-encode) โดย server กำหนดนามสกุลเอง (`.jpg`/`.png`/`.webp` ตามชนิดที่ตรวจได้) ใส่ `X-Content-Type-Options: nosniff` ให้ `/static`
  - เกณฑ์รับ: อัปโหลดไฟล์ HTML/SVG/ข้อความที่ตั้งชื่อเป็น `.html` หรือส่ง content-type `image/png` ปลอมได้ 422 ไม่มีไฟล์ถูกบันทึก ; ภาพจริง jpeg/png/webp บันทึกเป็นไฟล์ที่ re-encode แล้ว นามสกุลตามชนิดจริง ไม่ใช้ชื่อไฟล์จาก client ; response ของ `/static/*` มี `X-Content-Type-Options: nosniff` ; ปกเดิมที่มีอยู่ยังแสดงได้ ; สิทธิ์อัปโหลดปกตามตาราง T8.1 ไม่เปลี่ยน
  - ตรวจ: เทสต์ backend ใน `tests/test_templates_api.py` (ไฟล์ HTML ชื่อ `evil.html` + content-type `image/png` → 422, ภาพจริงสามชนิด → 200 และไฟล์เปิดด้วย Pillow ได้, นามสกุลถูก) ; TestClient เรียก `/static/...` แล้วมี header nosniff ; ตรวจกับข้อมูลจริงเฉพาะการเปิดดูปกเดิม
  - ไฟล์: `server/routers/templates.py`, `server/utils_io.py` (เพิ่มฟังก์ชันใหม่ ไม่เปลี่ยน `save_upload` เดิมที่ `/api/upload` ใช้), `server/main.py`
  - หมายเหตุ: `/api/upload` ทำแยกในข้อ C2 ข้างล่าง (ผู้ใช้ตัดสิน: ตรวจเนื้อหา ไม่ re-encode)

- [x] **B2 ตัวเลข "การทดลอง" นับเฉพาะ POST และไม่นับการ poll**
  - เกณฑ์รับ: `run_count`, `last_run_at` และ "การทดลองล่าสุด" นับเฉพาะ `processing.run` ที่ `details.method == "POST"` และไม่ใช่ `detection.train.jobs*` หรือ `detection.models` (ระบุเงื่อนไขในที่เดียวและใช้ร่วมกัน) ; ข้อความบนจอบอกความหมายตรง (เช่น "การประมวลผลที่สั่งรัน") ; ข้อมูล audit เดิมไม่ถูกแก้
  - ตรวจ: เทสต์ใน `tests/test_me_api.py` สร้าง log POST, GET poll ของงานเทรน และ GET models แล้ว summary นับเฉพาะ POST ; activity ที่กรองสำหรับ "การทดลองล่าสุด" ไม่มี poll ; บัญชีจริง: เทียบกับ `SELECT count(*) FROM audit_logs WHERE actor_id=<me> AND action='processing.run' AND metadata->>'method'='POST' AND metadata->>'operation' NOT LIKE 'detection.train.jobs%' AND metadata->>'operation' <> 'detection.models'`
  - ไฟล์: `server/routers/me.py`, `src/platform/pages/DashboardPage.tsx`, `ProfilePage.tsx`, `InstructorDashboard.tsx` (ป้าย)

- [x] **B3 admin อ่าน Private ของคนอื่นได้อย่างเดียว** ห้ามเขียนคอมเมนต์และห้ามเปิดปิดความคิดเห็นบน Private ของคนอื่น (GET และ load ยังทำได้ตามข้อ 8)
  - เกณฑ์รับ: admin `POST /api/templates/{private ของคนอื่น}/comments` ได้ 403 ; `PATCH /api/admin/templates/{private ของคนอื่น}/comments` ได้ 403 ; admin ยังเปิดปิดความคิดเห็นของ Official และ Public ได้ตามเดิม ; หน้าจอไม่แสดงช่องเขียนคอมเมนต์และสวิตช์ในกรณีนี้ ; plan.md ข้อ 8 แก้ข้อความให้ตรง
  - ตรวจ: เทสต์ใหม่ใน `tests/test_templates_api.py` และ `tests/test_admin_*.py` (ทั้งกรณี 403 และกรณีเดิมที่ยังต้องผ่าน)
  - ไฟล์: `server/routers/templates.py`, `server/routers/admin.py`, `src/platform/TemplateDetail.tsx`, `src/platform/templateAccess.ts`, `tasks/plan.md`

- [x] **B4 PATCH และอัปโหลดปกบน Private ของคนอื่นตอบ 404** แทน 403 เหมือน GET และ DELETE (กันการไล่หา id)
  - เกณฑ์รับ: ผู้ที่มองไม่เห็นแถวนั้น (ไม่ใช่เจ้าของ และไม่ใช่ admin) เรียก PATCH หรือ cover ได้ 404 ; ผู้ที่มองเห็นแต่ไม่มีสิทธิ์แก้ (เช่น admin กับ Private ของคนอื่น หรือใครก็ได้กับ Public ของคนอื่น) ยังได้ 403 ; เทสต์เดิมที่ล็อก 403 ไว้ (`test_private_template_is_owner_only_until_published`) แก้ค่าที่คาดเฉพาะกรณีนี้และระบุเหตุผลในคอมเมนต์
  - ตรวจ: เทสต์ใน `tests/test_templates_api.py` ครบทั้ง 404 และ 403 ข้างบน
  - ไฟล์: `server/routers/templates.py` (ใช้ `_get_visible_template` แบบ `delete_template`), `tests/test_templates_api.py`

- [x] **B5 บัญชีระบบ "VIPER Official"** ห้ามลบ แสดงในหน้า Users พร้อมป้าย "บัญชีระบบ" ล็อกไม่ให้แก้ role, แบน หรือ `can_teach` และไม่นับในสถิติ
  - เกณฑ์รับ: backend `PATCH /api/admin/users/{id}` กับบัญชี `provider == "system"` ได้ 403 ไม่มีอะไรเปลี่ยนและไม่มี audit log การเปลี่ยน ; ไม่มีทางลบบัญชีนี้ (ตอนนี้ไม่มี endpoint ลบผู้ใช้ ถ้ามีในอนาคตต้องกันด้วย) ; หน้า Users แสดงแถวนี้พร้อมป้าย "บัญชีระบบ" และควบคุมทุกตัว disabled ; Dashboard ของ admin "ผู้ใช้ที่เปิดใช้งาน" ไม่นับบัญชีนี้ (ตอนนี้จะได้ 3 จาก 4) ; seed ของ Official ยังใช้บัญชีนี้ได้ตามเดิม
  - ตรวจ: เทสต์ใหม่ใน `tests/test_admin_users.py` (role/status/can_teach กับบัญชีระบบ → 403) ; Playwright จำลองหน้า Users และ Dashboard ; บัญชีจริง: ตัวเลขบน Dashboard = `SELECT count(*) FROM users WHERE status='active' AND provider <> 'system'`
  - ไฟล์: `server/routers/admin.py`, `src/platform/pages/UsersPage.tsx`, `src/platform/pages/AdminDashboard.tsx`

- [x] **B6 server_default ของคอลัมน์ Boolean** เปลี่ยนจากข้อความ (`"false"`, `"true"`) เป็น `false()` / `true()` ของ SQLAlchemy สำหรับ `users.can_teach`, `templates.is_official`, `templates.comments_enabled`
  - เกณฑ์รับ: บน SQLite หลัง `create_all` insert แบบ raw โดยไม่ระบุคอลัมน์แล้ว ORM อ่าน `can_teach is False`, `is_official is False`, `comments_enabled is True` ; ไม่เปลี่ยน schema ของ PostgreSQL ที่มีอยู่ (ไม่มี ALTER ใหม่) และ DDL ที่ compile ด้วย `postgresql.dialect()` ยังได้ `DEFAULT false` / `DEFAULT true`
  - ตรวจ: เทสต์ใหม่ใน `tests/test_schema_columns.py` ; snapshot T1 แถวเดิมไม่เปลี่ยน
  - ไฟล์: `server/models.py`, `tests/test_schema_columns.py`

- [x] **B7 หน้าตา**
  - [x] **B7a editor ยังเป็นธีมมืดเดิมใต้ header แพลตฟอร์ม** (ผู้ใช้ตัดสิน: คงไว้) บันทึกใน `tasks/parity.md` แถว P-13 ว่าเป็นการตัดสินใจ ไม่ใช่งานค้าง
    - ตรวจ: หมายเหตุ P-13 ระบุการตัดสินใจ 21 พ.ย.
  - [x] **B7b ซ่อน header แพลตฟอร์มบน `/lab` ในโหมดจอแคบ (compact-mobile เช่นโทรศัพท์แนวนอน)**
    - เกณฑ์รับ: ในโหมด compact-mobile header แพลตฟอร์มไม่กินพื้นที่ editor ; เมนูบัญชี (โปรไฟล์ แผงจัดการผู้ใช้ของ admin ออกจากระบบ) และการไปหน้าอื่นยังเข้าถึงได้ทางใดทางหนึ่งบน `/lab` (ห้ามหาย) ; จอปกติและ 375 แนวตั้งไม่เปลี่ยน ; หน้าไม่ล้นจอ
    - ตรวจ: Playwright/browser ที่ 844×390 (มี pointer coarse) วัดความสูงของ editor เพิ่มขึ้นจาก ~288px และหาเมนูบัญชีกับ Log out เจอ ; ที่ 1440×900 และ 375×812 ผลเหมือนก่อนแก้
    - ไฟล์: `src/App.tsx` (LabHost), `src/platform/styles/lab.css`, อาจรวม `src/pages/LabPage.tsx` (เพิ่มอย่างเดียว)
  - [x] **B7c การ์ด template แสดงไอคอนแทนภาพ preview ของ workflow** (ผู้ใช้ตัดสิน: คงไว้) บันทึกใน `tasks/parity.md` แถว P-22
    - ตรวจ: หมายเหตุ P-22 ระบุการตัดสินใจ 21 พ.ย.

#### ข้อสังเกตที่ผู้ใช้สั่งให้ทำด้วย (21 พ.ย. 2569)
- [x] **C1 ธีมของ header บน `/lab` ซิงก์กับหน้าอื่น** ตอนนี้ไม่ตามธีมที่สลับจากหน้าอื่นจนกว่าจะ reload เพราะ `LabHost` เก็บ state ธีมของตัวเอง (code-reviewer ข้อ 6)
  - เกณฑ์รับ: สลับธีมที่หน้าใดก็ได้ แล้วไป/กลับ `/lab` header ทั้งสองที่เป็นธีมเดียวกันทันทีโดยไม่ reload ; สลับบน `/lab` แล้วกลับหน้าอื่นก็ตามด้วย ; ค่าที่จำไว้ใน localStorage ยังทำงานเหมือนเดิม
  - ตรวจ: เบราว์เซอร์: หน้า Templates สลับธีม แล้วไป `/lab` อ่าน `data-theme` ของ header ตรงกัน ; ทำกลับทาง
  - ไฟล์: `src/platform/theme.ts`, `src/App.tsx`, อาจรวม `src/platform/Layout.tsx`
- [x] **C2 `/api/upload` ตรวจชนิดจากเนื้อหาจริง** ไม่ re-encode (ภาพที่ใช้ประมวลผลต้องไม่เปลี่ยน) server กำหนดนามสกุลเองตามชนิดที่ตรวจได้
  - เกณฑ์รับ: รายการชนิดที่ยอมรับต้องครอบคลุมทุกชนิดที่ระบบรับอยู่ตอนนี้ (เช่น TIFF, BMP ถ้าเคยรับได้) ห้ามทำให้ workflow เดิมอัปโหลดไม่ได้ ; ไฟล์ที่ไม่ใช่ภาพ (HTML/SVG/ข้อความ) แม้ส่ง content-type ภาพปลอมได้ 4xx และไม่มีไฟล์ถูกบันทึก ; ไบต์ของไฟล์ที่บันทึกเท่ากับที่อัปโหลด
  - ตรวจ: เทสต์อัปโหลดไฟล์แต่ละชนิดที่รับเดิมผ่านหมด และไบต์ตรงกัน ; ไฟล์ปลอม → 4xx
  - ไฟล์: `server/utils_io.py` (เพิ่มฟังก์ชันใหม่), router ของ `/api/upload`, เทสต์ใหม่

#### ผลตรวจรับ (21 พ.ย. 2569)
- `scripts/check.sh` → `CHECK PASS` (pytest ผ่าน 324 ล้ม 15 เฉพาะ SURF, lint error 0, build ผ่าน, node --test 9) เส้นฐาน pytest ปรับเป็น >= 324
- เทสต์ backend ใหม่: `tests/test_templates_api.py` (B1, nosniff, B3, B4, A5a), `tests/test_me_api.py` (B2, A5b), `tests/test_schema_columns.py` (A5c, B6), `tests/test_admin_audit_logs.py` (A5d), `tests/test_admin_users.py` (B5), `tests/test_upload_api.py` ใหม่ (C2: JPEG/PNG/BMP/WebP/TIFF/ไม่มีนามสกุล/.pt zip/.pth pickle ไบต์ตรงกัน, ไฟล์ปลอม 422 ไม่มีไฟล์ถูกเขียน, ชุดที่มีไฟล์เสียไม่เขียนเลย) ไม่มีเทสต์ใหม่ล้มก่อนแก้โค้ดที่ต้องรายงาน
- เทสต์เดิมที่แก้ค่าที่คาดเพราะพฤติกรรมเปลี่ยนตามการตัดสินใจ: `test_private_template_is_owner_only_until_published` (PATCH Private คนอื่น 403 → 404, B4), เทสต์อัปโหลดปก 5 จุดใช้ภาพ PNG จริงแทนไบต์ปลอมและเทียบว่าเปิดเป็น PNG ได้แทนไบต์ตรง (B1), `test_successful_upload_creates_processing_activity_log` ส่ง PNG จริงและเขียนลง tmp_path (C2), `test_summary_matches_what_was_created_and_ignores_other_users` ระบุ method POST ให้แถว processing.run (B2)
- Playwright จำลอง API (ไม่แตะฐานข้อมูลจริง) 21/21 สคริปต์อยู่ที่ `scripts/ui_checks.py` (ใช้ซ้ำใน T23 ต้องเปิด dev server 5173 ก่อน): A1 (SAVE TEMPLATE, "?" และ Delete กลับมาทำงานหลังปิด), A2, A4a, A4b (`page.clock` เลื่อน 90 วิ ต่าง < 20ms), A4c (90 แถว ไม่มีคำเตือน key), A4d, A4e (ยกเลิก 0 PATCH ยืนยัน 1), A4f, B5 UI, B7b (844×390 touch: header 0px editor 390px มีปุ่ม "เมนู" เปิดเมนูบัญชีและออกจากระบบได้; 1440×900 และ 375×812 header แสดงตามเดิม ไม่ล้นจอ)
- ข้อมูลจริง (admin id 2 เช็ก `/api/auth/me` ก่อน): `run_count` 90 = SQL B2 (เดิมนับ 930), `last_run_at` ตรง ; `PATCH /api/admin/users/3` (บัญชีระบบ) → 403 ; หน้า Users แถว VIPER Official มีป้าย "บัญชีระบบ" ควบคุมทั้ง 3 ตัว disabled ; Dashboard "ผู้ใช้ที่เปิดใช้งาน" 3 = SQL ; ปกเดิม `/static/template_covers/ade70c34….png` 200 `image/png` + `nosniff` ; C1 สลับธีมที่ /templates แล้ว /lab ตามทันที และกลับทางก็ตาม ; A3 Homography (~13 วิ) กด Start แล้วเปิด Homography เดิม (id โหนดซ้ำ) จากหน้า Templates ที่ 1.4 วิ: มีข้อความแจ้ง แท็บที่รันไม่ถูกสลับ log ได้ "Pipeline Finished" ผลครบ 6 โหนดในแท็บเดิม แท็บใหม่ไม่มีผล `/load` 1 ครั้ง
- แถวเดิมตาม snapshot T1 ไม่เปลี่ยนทุกตาราง (users 4, templates 13, comments 1, audit_logs 2,626, results 31) ; schema ของ PostgreSQL ไม่เปลี่ยน (DEFAULT false/true เดิม ไม่มี ALTER ใหม่)
- เพิ่มจากแผน: A1 ต้องปิด `deleteKeyCode` ของ React Flow ตอน editor ไม่ active (`src/FlowCanvas.tsx`) เพราะ React Flow ลบโหนดด้วย Backspace เองผ่าน document และกัน Backspace/Delete ตอนมี modal อื่นของ Lab เปิด (dialog แก้ template ในคลัง) ; A4f ต้องส่ง `templateRefreshKey` ผ่าน `src/components/sidebar.tsx` (เพิ่ม prop อย่างเดียว) ; B3 ฝั่งจอแก้ `src/platform/pages/TemplatesPage.tsx` ด้วย ; B5 Dashboard แก้ `AdminDashboard.tsx` ; C2 ยอมรับไฟล์ weights `.pt`/`.pth` ด้วยเพราะ node U-Net อัปโหลดผ่าน `/api/upload` (ตรวจ magic ของ zip หรือ pickle และนามสกุลต้องเป็น .pt/.pth)

#### งานรอบถัดไป (ไม่ทำในแผนนี้) ข้อ Low จาก security-auditor
- ตั้ง `https_only=True` ให้ session cookie เมื่อ deploy ผ่าน HTTPS (`server/main.py`)
- ตรวจ header `Origin` / `Sec-Fetch-Site` กับทุก method ที่ไม่ใช่ GET หรือใช้ CSRF token แบบ double-submit (ตอนนี้พึ่ง SameSite=Lax อย่างเดียว)
- จำกัดจำนวนค่า `action` ใน `/api/me/activity` และ `/api/admin/audit-logs` (เช่นไม่เกิน 50) และความยาวแต่ละค่า
- ให้ startup ล้มเมื่อใช้ `SESSION_SECRET` ค่า default นอก dev (`server/config.py`)
- ย้าย seed ออกจาก `GET /api/templates/official` ไปทำตอน startup อย่างเดียว หรือใช้ `INSERT ... ON CONFLICT DO NOTHING` และ commit เฉพาะเมื่อมีการเปลี่ยน
- ไฟล์ปกของ template ที่ถูกลบหรือเป็น Private ยังเปิดได้ผ่าน `/static` โดยไม่ต้อง login (เสิร์ฟผ่าน endpoint ที่ตรวจสิทธิ์ หรือย้าย/เปลี่ยนชื่อไฟล์ตอนลบ)
- ระบุ `weights_only=True` ให้ `torch.load` ทั้ง 6 จุด (`server/algos/restoration/dncnn.py:56`, `restoration/SwinIR.py:94`, `segmentation/DeepLabv3.py:41`, `segmentation/UNET.py:92`, `segmentation/MaskRNN.py:50`, `enchancement/Zero.py:83`) ตอนนี้ปลอดภัยเพราะ torch 2.13 ใช้ค่านี้เป็นค่าเริ่มต้นอยู่แล้ว แต่ควรระบุเองไม่พึ่งค่าเริ่มต้น (ผู้ใช้สั่งจด 21 พ.ย. 2569 หลังเพิ่ม C2 ที่รับ .pt/.pth)

---

## ระยะ 3: ส่วนที่ปล่อยว่าง

### [x] T18 `learningApi.ts` ที่คืนรายการว่าง
ไฟล์เดียวที่เป็นแหล่งข้อมูลของคอร์ส บทเรียน งานที่ส่ง คะแนน ประกาศ และการแจ้งเตือน พร้อม type ที่ตรงกับโครงข้อมูลของ mockup

- เกณฑ์รับ
  - [x] ทุกฟังก์ชันคืนรายการว่างและมี type ครบ
  - [x] ไม่มีหน้าใดอ่านข้อมูลกลุ่มนี้จากที่อื่น
- ตรวจ: FE
- ขึ้นกับ: T5
- ไฟล์: `src/lib/learningApi.ts`, `src/platform/types.ts`
- ขนาด: S
- skill: `api-and-interface-design` (ไฟล์นี้เป็นจุดต่อกับระบบคอร์สรอบหน้า)
- ผู้ทำ: Sonnet subagent (medium) · ชุด G

### [x] T19 หน้า Courses, Course, Lesson, Teach แบบว่าง
ย้ายโครงหน้า `CourseCatalog`, `CoursePage`, `LessonPage`, `TeachHome` ให้แสดงสถานะว่างที่บอกว่าจะเพิ่มภายหลัง

- เกณฑ์รับ
  - [x] `/courses` แสดงหัวข้อและข้อความว่างตามแบบ mockup
  - [x] ผู้ที่ไม่มี `can_teach` เปิดหน้า Teach แล้วเห็นข้อความ "ต้องได้รับสิทธิ์ผู้สอน"
  - [x] ปุ่มสร้างคอร์สและตัวออกแบบ Lab ไม่เปิดใช้ และบันทึกในตารางเทียบว่า `ว่างตามแผน`
- ตรวจ: FE, เปิดทุก route ตรวจ console ไม่มี error
- ขึ้นกับ: T18
- ไฟล์: `src/platform/pages/CoursesPage.tsx`, `src/platform/pages/TeachPage.tsx`, `src/routes.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด G

### [x] T20 หน้า Submissions, Grades, Announcements และกระดิ่งแบบว่าง
ย้ายโครง `SubmissionsHub`, `LearningHistory`, `Reviews`, `Gradebook`, `Announcements` และรายการแจ้งเตือน

- เกณฑ์รับ
  - [x] แต่ละหน้าแสดงหัวข้อ แท็บสลับ และสถานะว่าง
  - [x] ไม่มีงานตัวอย่าง คะแนน หรือการแจ้งเตือนตัวอย่างของ mockup
- ตรวจ: FE, เปิดทุก route ด้วยบัญชี admin และบัญชีธรรมดา
- ขึ้นกับ: T18
- ไฟล์: `src/platform/pages/SubmissionsPage.tsx`, `src/platform/pages/AnnouncementsPage.tsx`, `src/platform/Header.tsx`
- ขนาด: M
- skill: `frontend-ui-engineering`
- ผู้ทำ: Sonnet subagent (medium) · ชุด G

ผลตรวจรับชุด G (22 พ.ย. 2569, Opus ตัวหลัก): commit `2d7ee69a` (T18), `23adf420` (T19), `95599daf` (T20) ; `scripts/check.sh` → `CHECK PASS` (pytest 324/15 SURF, lint 0 error, build, node 9) ; อ่าน diff: `learningApi.ts` คืน `[]`/`null` ทุกฟังก์ชัน type อยู่ใน `platform/types.ts` หน้าใหม่และกระดิ่งอ่านผ่าน learningApi เท่านั้น ไม่พบข้อมูลตัวอย่างของ mockup (เทียบชื่อ title ใน `platform.mjs`) ; บัญชี admin จริงเปิด 8 route ใหม่ แสดงสถานะว่าง console ไม่มี error ; Playwright จำลองผู้เรียน: `/teach` และ `/teach/:id` ขึ้น "ต้องได้รับสิทธิ์ผู้สอน" เมนูมี My Submissions กระดิ่ง "ไม่มีการแจ้งเตือน" ไม่มี error ; ไฟล์นอกรายการ: `routes.tsx` ใน T20 (ลงทะเบียน route, `PLANNED_PATHS` เหลือ `[]` คงกลไก NotReadyPage ไว้) และ `parity.md`

### จุดตรวจ 3
- [x] agent: `agent-skills:code-reviewer` (22 พ.ย. 2569: Critical 0, Important 3, Minor/Nit หลายข้อ ดูหัวข้อถัดไป)
- [x] ทุก route ในตารางเทียบเปิดได้ ไม่มีหน้าขาวหรือ error ใน console (admin จริง 15 route: `/`, templates, users, logs, profile, courses, courses/:id, lessons/:id, teach, teach/:id, submissions, submissions?tab=grades, announcements, 404, lab ; ผู้เรียนจำลอง 8 route ใหม่ + กระดิ่ง)
- [x] BE, FE, LAB ผ่าน (`check.sh` CHECK PASS ; Lab รัน Homography จริงได้ "Pipeline Finished" ผลครบ 6 โหนด console ไม่มี error)

#### ผล code-reviewer จุดตรวจ 3 (รอผู้ใช้ตัดสินว่าจะแก้ข้อไหนก่อนระยะ 4)
- Important
  - R1 กระดิ่งไม่มีตัวเลขยังไม่อ่าน (`notification-count`) และจุด `tiny-dot` ต่อรายการแบบ mockup (`Header.tsx`) CSS ยังอยู่
  - R2 admin ที่ไม่มี `can_teach` ไม่มีเมนู Submissions (`permissions.ts:34` ใช้ `teacher` อย่างเดียว) แต่หน้า `/submissions` ถือว่า admin เป็นฝั่งผู้สอน ; mockup `canTeach` คืน true ให้ admin
  - R3 `/submissions` เลือกฝั่งผู้เรียน/ผู้สอนตามบทบาท ไม่ใช่ตาม view แบบ mockup: เมื่อมีการลงทะเบียน (learnsSomething) ผู้สอนจะมีเมนู Submissions และ My Submissions ที่ไปหน้าเดียวกัน เห็นงานของตัวเองไม่ได้ (เสนอใส่ฝั่งใน URL เช่น `?side=mine`)
- Minor
  - `COURSE_STATUS` ซ้ำสองไฟล์ และ destructure โดยไม่มี fallback สถานะที่ไม่รู้จักจะทำให้หน้าพัง (`CoursesPage.tsx:46,144`, `TeachPage.tsx:78,142`)
  - สัญญาของ `getCourse`/`getLesson` คืน null ทั้งไม่พบและไม่มีสิทธิ์ ; `LessonView` จึงขึ้น "ต้องลงทะเบียนก่อน" แม้ id ไม่มีอยู่
  - `types.ts`: metric ไม่มีชื่อ, `AutoCheckItem` มีทั้ง `ok` และ `passed`, rubric ผูกกับค่าคงที่ฝั่งหน้า, ฟังก์ชันรายการไม่มี pagination
  - `Header.tsx` `navigate(item.to)` ไม่ตรวจว่าเป็น path ภายใน ; กระดิ่งโหลดครั้งเดียวต่อ mount
  - `reviewOf` หาแบบ O(n·m) ใน `SubmissionsPage.tsx`
- Nit: CourseTabs ใช้ปุ่ม+navigate แทน Link ; `<p>` ใน `<button>` ; โค้ดผู้เยี่ยมชมที่ไม่มีทางถึงใน `CoursesPage.tsx:170` และ parity P-05/P-06/P-07/P-21 ยังเขียนว่าผู้เยี่ยมชมเห็น (ขัดกับการตัดสินใจ 17 พ.ย.) ; parity P-11 ยังเขียนว่าไม่มีไฟล์ ; Gradebook ไม่มีสถานะกำลังโหลด ; `COMING_LATER` ซ้ำ 3 ไฟล์

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
  - [ ] สคริปต์กำหนดธีมให้ตรงกับภาพ mockup ทุกครั้ง (ผู้ใช้กำหนด 17 พ.ย.: ของจริงใช้ธีมตามระบบเป็นค่าเริ่มต้น จึงต้องตั้ง `viper.platform.theme` หรือ `color_scheme` ของ browser ให้ตรงกับธีมของภาพ mockup แถวนั้น ไม่พึ่งค่าตามระบบ)
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
  - [ ] ออกจาก `/lab` ระหว่าง pipeline กำลังรันแล้วกลับมา: งานรันต่อ เห็นผล กด Stop ได้ การแก้ไม่หาย undo/redo, Log panel และ clipboard ยังอยู่ ปุ่มลัดในหน้าอื่นไม่แก้ canvas และ fit view ใหม่ตอนกลับ (แถว R-43)
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
