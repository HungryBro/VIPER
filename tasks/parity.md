# ตารางเทียบ (parity matrix): Mockup v2 กับ VIPER จริง

สร้างใน T2 (17 พ.ย. 2569) จากแผน [plan.md](plan.md) และรายการ [todo.md](todo.md) · ต้นทาง: `outputs/viper-learning-v2/src/` · ปลายทาง: `my-react-flow-app/` + `server/`

ตารางนี้เป็นหลักฐานชั้นที่ 1 ของ "วิธีเปรียบเทียบ mockup กับของจริง" ใน plan.md ทุก task ที่ย้ายหน้าต้องแก้คอลัมน์ **สถานะปัจจุบัน** ของแถวตัวเองเมื่อเสร็จ (T25 ปิดตาราง) ห้ามเพิ่มหรือลบแถวโดยไม่แก้สคริปต์ `scripts/parity_screenshots.py` ให้ตรงกัน (รันตรวจด้วย `--check`)

## วิธีอ่าน

- **สถานะเป้าหมาย** (ตัดสินแล้วตามแผน): `ย้าย` = ทำให้ของจริงมีหน้า/ส่วนนี้ตาม mockup และต่อข้อมูลจริง · `ว่างตามแผน` = ย้ายโครงหน้าแต่ไม่มีข้อมูล แสดงสถานะว่าง (คอร์ส บทเรียน กิจกรรม งานที่ส่ง คะแนน ประกาศ การแจ้งเตือน) · `ตัดออก` = ไม่ย้ายโดยตั้งใจ พร้อมเหตุผล
- **สถานะปัจจุบัน** มี 4 ค่า: `ย้ายแล้ว`, `ว่างตามแผน`, `ตัดออก`, `ยังไม่ทำ` (ทุกแถวเริ่มที่ `ยังไม่ทำ`; แถวที่เป้าหมายเป็น `ว่างตามแผน`/`ตัดออก` เปลี่ยนเป็นค่านั้นเมื่อ task ที่รับผิดชอบทำเสร็จและตรวจแล้ว)
- **บทบาท**: ผู้เยี่ยมชม = ไม่ login (`guest`), ผู้เรียน (`learner`), ผู้สอน = `canTeach` (`instructor`), ผู้ดูแล = `role=admin` (`admin`) ชื่อไฟล์ภาพใช้คำในวงเล็บ
- **ภาพ mockup**: `outputs/parity-report/mockup/<รหัสแถว>__<บทบาท>__<กว้าง>.png` ถ่ายที่ 1440×900 และ 375×812 ด้วย `./.venv/bin/python scripts/parity_screenshots.py` (รายละเอียดรูปแบบย่อ `{a,b}` ในคอลัมน์ภาพ = ทุกค่าในวงเล็บ) ผลถ่ายและเหตุที่ถ่ายไม่ได้อยู่ใน `outputs/parity-report/mockup/manifest.json`
- **route ของจริง**: เฉพาะ `/lab`, `/courses`, `/users` และชื่อไฟล์ที่ระบุใน todo.md เป็นค่าที่ตกลงแล้ว route อื่นที่ลงตารางเป็น "(เสนอ)" ให้ T4 หรือ task ที่เกี่ยวข้องยืนยันตอนทำ แล้วแก้ในตารางนี้
- mockup ไม่มี URL routing (ใช้ state `view` ใน `App.jsx`) ชื่อ view จึงอยู่ในคอลัมน์ "ตำแหน่งใน mockup"
- ข้อมูลตัวอย่างของ mockup (บัญชี John Doe, อริศรา ฯลฯ, template 8 รายการ, log 4 รายการ) ไม่ย้ายทุกกรณี; `department`, `studentId`, `bio` ไม่แสดงในรอบนี้
- **ผู้เยี่ยมชม** (ผู้ใช้ตัดสินใจ 17 พ.ย.): ของจริงให้ผู้เยี่ยมชมเห็นหน้าแรก (`/`) อย่างเดียว ทุก route อื่นรวม `/profile` พาไป Login แล้วกลับมาหลัง login (T7) คอลัมน์ "บทบาทที่เห็น" บอกบทบาทใน mockup
- **การตัดสินใจของ T2 ที่ผู้ใช้ยืนยันแล้ว (17 พ.ย.)**: C-09, C-11, C-23, C-24 ตามที่ลงไว้; P-29 เปลี่ยนเป็น `ตัดออก`; C-14 เปลี่ยนเป็น `ย้าย` (เพิ่ม soft delete ใน T8.1)

## ส่วนที่ 1: mockup → ของจริง

### 1.1 หน้า (view ใน `App.jsx`)

| รหัส | ตำแหน่งใน mockup | route / ไฟล์ในของจริง | แหล่งข้อมูลจริง | บทบาทที่เห็น | สถานะเป้าหมาย | สถานะปัจจุบัน | task | ภาพ mockup | หมายเหตุ |
|---|---|---|---|---|---|---|---|---|---|
| P-01 | `App.jsx` view `home` ไม่ login → `GuestHome` (`Guest.jsx`) + `MiniWorkflow` | `/` (ไม่ login) · `src/platform/pages/GuestHome.tsx` | ข้อความคงที่; รายการ "คอร์สที่เปิดสอน" ไม่มี — `learningApi.ts` คืนว่าง | ผู้เยี่ยมชม | ย้าย | ยังไม่ทำ | T7 | `P-01__guest__{1440,375}.png` | ส่วนคอร์สแสดงว่าง; ภาพ preview Lab เป็นภาพประกอบคงที่ ไม่มีผลจำลอง |
| P-02 | view `home` ผู้เรียน → `Dashboard` (+ `LearningTimeline`) | `/` (login, ไม่มี `can_teach`) · `src/platform/pages/DashboardPage.tsx` | การทดลองล่าสุด: `GET /api/me/activity` (T15); จำนวน Template ของฉัน: `GET /api/me/summary` (T15); ความคืบหน้า บทเรียนแนะนำ งานกำหนดส่ง ฟีดแบค: ไม่มี — `learningApi.ts` คืนว่าง | ผู้เรียน | ย้าย | ยังไม่ทำ | T17 | `P-02__learner__{1440,375}.png` | ส่วนคอร์ส/ไทม์ไลน์/ความคืบหน้า/ฟีดแบคเป็น `ว่างตามแผน` ภายในหน้า ไม่มีชื่อหรือตัวเลขตัวอย่างของ mockup |
| P-03 | view `home` ผู้สอน → `InstructorDashboard` + `Stat` | `/` (login, `can_teach`) · `src/platform/pages/InstructorDashboard.tsx` | สิทธิ์ผู้สอน: `users.can_teach` (T8); ตัวเลขคอร์ส/งานรอตรวจ/ตรวจแล้ว: ไม่มี — `learningApi.ts` คืนว่าง (0) | ผู้สอน | ย้าย | ยังไม่ทำ | T17 | `P-03__instructor__{1440,375}.png` | ตัวเลขทุกช่องเป็น 0 ตามแผน; ปุ่ม "ตรวจงานที่ส่ง" ไปหน้า Submissions แบบว่าง |
| P-04 | view `home` ผู้ดูแล → `AdminDashboard` + `Stat` | `/` (login, `role=admin`) · `src/platform/pages/AdminDashboard.tsx` | ผู้ใช้: `GET /api/admin/users`; template: `GET /api/templates`; เหตุการณ์: `GET /api/admin/audit-logs`; คอร์ส/งานรอตรวจ: ไม่มี — `learningApi.ts` คืนว่าง | ผู้ดูแล | ย้าย | ยังไม่ทำ | T17 | `P-04__admin__{1440,375}.png` | เกณฑ์ T17: ตัวเลขผู้ใช้ template และเหตุการณ์ต้องตรงกับ SQL |
| P-05 | view `lessons` → `CourseCatalog` (+ `CourseTabs` สำหรับผู้สอน) | `/courses` · `src/platform/pages/CoursesPage.tsx` | ไม่มี — `learningApi.ts` คืนว่าง | ผู้เยี่ยมชม, ผู้เรียน, ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T19 | `P-05__{guest,learner,instructor,admin}__{1440,375}.png` | ไม่มีตารางคอร์สในรอบนี้; ปุ่มสร้างคอร์สไม่เปิดใช้; ของจริง: ผู้เยี่ยมชมถูกพาไป Login (ผู้ใช้ตัดสินใจ 17 พ.ย. เห็นหน้าแรกอย่างเดียว) ภาพ guest ของ mockup เก็บไว้อ้างอิง |
| P-06 | view `course` → `CoursePage` | `/courses/:courseId` (เสนอ) · `src/platform/pages/CoursesPage.tsx` | ไม่มี — `learningApi.ts` คืนว่าง | ผู้เยี่ยมชม, ผู้เรียน, ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T19 | `P-06__{guest,learner,instructor,admin}__{1440,375}.png` | จริงไม่มีคอร์ส จึงแสดง "ไม่พบคอร์ส" แบบว่าง; ของจริง: ผู้เยี่ยมชมถูกพาไป Login (ผู้ใช้ตัดสินใจ 17 พ.ย. เห็นหน้าแรกอย่างเดียว) ภาพ guest ของ mockup เก็บไว้อ้างอิง |
| P-07 | view `lesson` → `LessonPage` | `/lessons/:lessonId` (เสนอ) · `src/platform/pages/CoursesPage.tsx` | ไม่มี — `learningApi.ts` คืนว่าง | ผู้เยี่ยมชม (เห็นหน้าล็อก), ผู้เรียน, ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T19 | `P-07__{guest,learner,instructor,admin}__{1440,375}.png` | ของจริง: ผู้เยี่ยมชมถูกพาไป Login (ผู้ใช้ตัดสินใจ 17 พ.ย. เห็นหน้าแรกอย่างเดียว) ภาพ guest ของ mockup เก็บไว้อ้างอิง |
| P-08 | view `assignment` → `LessonPage` (ชื่อ view อีกชื่อของ lesson) | เหมือน P-07 (ไม่มี route แยก) | ไม่มี — `learningApi.ts` คืนว่าง | ผู้เรียน, ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T19 | `P-08__{learner,instructor,admin}__{1440,375}.png` | render เหมือน `lesson` ทุกประการ (ถ่ายไว้ยืนยัน) |
| P-09 | view `teach` → `TeachHome` | `/teach` (เสนอ) · `src/platform/pages/TeachPage.tsx` | ไม่มี — `learningApi.ts` คืนว่าง; สิทธิ์จาก `users.can_teach` | ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T19 | `P-09__{instructor,admin}__{1440,375}.png` | ปุ่มสร้างคอร์สไม่เปิดใช้ |
| P-10 | `TEACH_VIEWS` guard ใน `App` (`blockedTeach`) → `Empty` "ต้องได้รับสิทธิ์ผู้สอน" | `/teach` เมื่อไม่มี `can_teach` · `src/platform/pages/TeachPage.tsx` | `can_teach` จาก `/api/auth/me` | ผู้เรียน | ย้าย | ยังไม่ทำ | T19 | `P-10__learner__{1440,375}.png` | เกณฑ์ T19 ข้อ 2 |
| P-11 | view `teachCourse` → `CourseEditor` (+ `CourseForm`, `LessonEditor`) | `/teach/:courseId` (เสนอ) · ไม่มีไฟล์ในรอบนี้ (ปุ่มเข้าไม่เปิดใช้) | ไม่มี — `learningApi.ts` คืนว่าง | ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T19 | `P-11__{instructor,admin}__{1440,375}.png` | ไม่มีคอร์สให้แก้ จึงแสดงสถานะ "จัดการคอร์สนี้ไม่ได้/ว่าง" |
| P-12 | view `design` → `LabGate` → `Lab` โหมด design + `DesignerPanel` + `ListEditor` | ไม่มี route ในรอบนี้ (ปุ่ม "ตัวออกแบบ Lab" ไม่เปิดใช้) | ไม่มี — ต้องมีกิจกรรม/บทเรียน | ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T19 | `P-12__{instructor,admin}__{1440,375}.png` | รวมแผงออกแบบ Activity ทางขวาของ Lab |
| P-13 | view `lab` (`labLesson=free`) → `LabGate` → `Lab` โหมด free | `/lab` · `src/pages/LabPage.tsx` (editor เดิมจาก `App.tsx`) | editor เดิมทั้งชุด: `NODE_CATALOG` 22 ชนิด (`nodeCatalog.ts`) + API ประมวลผลจริง `/api/*`; ไม่ย้าย `CATALOG`/`simulate` ของ mockup | ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T4, T13, T14 | `P-13__{learner,instructor,admin}__{1440,375}.png` | ผู้เยี่ยมชมกด Lab แล้วถูกพาไป login (mockup ใช้ `go()` guard) จึงไม่มีภาพผู้เยี่ยมชม; ปรับหัว Lab/คลังตาม mockup แต่ใช้ editor จริง (ดูส่วนที่ 2) |
| P-14 | view `lab` + id บทเรียน, โหมด `learn` (ผู้เรียนที่ลงทะเบียน) → `Lab` + `GuideStep` + `AutoCheck` | ไม่มี route (แผงโจทย์และปุ่มส่งงานไม่แสดง) | ไม่มี — ไม่มีกิจกรรม | ผู้เรียน | ว่างตามแผน | ยังไม่ทำ | T14 | `P-14__learner__{1440,375}.png` | เกณฑ์ T14 ข้อ 3: แผงโจทย์และปุ่มส่งงานไม่แสดง |
| P-15 | view `lab` + id บทเรียน, โหมด `preview` (ผู้สอน/ผู้ดูแลดูแบบผู้เรียน) | ไม่มี route | ไม่มี — ไม่มีกิจกรรม | ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T14 | `P-15__{instructor,admin}__{1440,375}.png` | |
| P-16 | `LabGate` โหมด `blocked` ("เปิด Lab นี้ไม่ได้") | ไม่มี route | ไม่มี — ไม่มีการลงทะเบียนคอร์ส | ผู้เรียน | ว่างตามแผน | ยังไม่ทำ | T14 | `P-16__learner__{1440,375}.png` | ถ่ายด้วยบทเรียน `cv-intro` ที่ผู้เรียนยังไม่ลงทะเบียน |
| P-17 | view `history` → `SubmissionsHub` → `LearningHistory` (My Submissions) | `/submissions` (เสนอ) · `src/platform/pages/SubmissionsPage.tsx` | ไม่มี — `learningApi.ts` คืนว่าง | ผู้เรียน, ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T20 | `P-17__{learner,instructor,admin}__{1440,375}.png` | เมนู My Submissions แสดงให้ผู้เรียนและผู้สอนที่ลงทะเบียนเรียน (ของจริงไม่มีการลงทะเบียน) |
| P-18 | view `review` → `SubmissionsHub` → `Reviews` (Submissions ฝั่งผู้สอน + แบบฟอร์มคะแนน) | `/submissions` (เสนอ, ฝั่งผู้สอน) · `src/platform/pages/SubmissionsPage.tsx` | ไม่มี — `learningApi.ts` คืนว่าง | ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T20 | `P-18__{instructor,admin}__{1440,375}.png` | |
| P-19 | view `grades` → `SubmissionsHub` → `Gradebook` (ผู้เรียน) | `/submissions?tab=grades` (เสนอ) · `SubmissionsPage.tsx` | ไม่มี — `learningApi.ts` คืนว่าง | ผู้เรียน, ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T20 | `P-19__{learner,instructor,admin}__{1440,375}.png` | |
| P-20 | view `teachGrades` → `SubmissionsHub` → `Gradebook` (ผู้สอน) | `/submissions?tab=grades` ฝั่งผู้สอน (เสนอ) · `SubmissionsPage.tsx` | ไม่มี — `learningApi.ts` คืนว่าง | ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T20 | `P-20__{instructor,admin}__{1440,375}.png` | |
| P-21 | view `announcements` → `Announcements` | `/announcements` (เสนอ) · `src/platform/pages/AnnouncementsPage.tsx` | ไม่มี — `learningApi.ts` คืนว่าง | ผู้เยี่ยมชม, ผู้เรียน, ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T20 | `P-21__{guest,learner,instructor,admin}__{1440,375}.png` | ไม่มีเมนูหลักไปหน้านี้ใน mockup (เปิดได้ผ่านปุ่มใน LogDetail ของ `ANNOUNCEMENT_CREATE`); ฟอร์มเผยแพร่ประกาศไม่เปิดใช้; ของจริง: ผู้เยี่ยมชมถูกพาไป Login (ผู้ใช้ตัดสินใจ 17 พ.ย. เห็นหน้าแรกอย่างเดียว) ภาพ guest ของ mockup เก็บไว้อ้างอิง |
| P-22 | view `templates` → `TemplateLibrary` (แท็บ ทั้งหมด/Official/Public/Private + ค้นหา) | `/templates` (เสนอ) · `src/platform/pages/TemplatesPage.tsx` | ตาราง `templates` ผ่าน `GET /api/templates`, `/api/templates/official`, `/api/templates/mine` (`templateApi.ts`); Official = `is_official` | ผู้เยี่ยมชม, ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T12 | `P-22__{guest,learner,instructor,admin}__{1440,375}.png` | จริงแยก Official 9 / Public / ของฉัน (mockup เรียก Private); แสดงเฉพาะ template จริงจากฐานข้อมูล (13 แถว ณ 17 พ.ย. ไม่นับที่ถูกลบ) Private เห็นเฉพาะเจ้าของ ห้ามมี template ตัวอย่างของ mockup; ของจริง: ผู้เยี่ยมชมถูกพาไป Login (ผู้ใช้ตัดสินใจ 17 พ.ย. เห็นหน้าแรกอย่างเดียว) ภาพ guest ของ mockup เก็บไว้อ้างอิง |
| P-23 | view `users` → `AdminUsers` | `/users` · `src/platform/pages/UsersPage.tsx` | ตาราง `users` ผ่าน `GET /api/admin/users`, `PATCH /api/admin/users/{id}` (`adminApi.ts`); `active` = `status`, `lastSeen` = `last_login_at`, `joinedAt` = `created_at`; `can_teach` (T8) | ผู้ดูแล | ย้าย | ยังไม่ทำ | T9 | `P-23__admin__{1440,375}.png` | ต้องรวมเปลี่ยน role + แบนมีวันหมดอายุของ `AdminUserPanel` (ส่วนที่ 2); mockup ไม่ guard view นี้ แต่ของจริงต้อง 403 สำหรับผู้ใช้ธรรมดา |
| P-24 | view `logs` → `PlatformLogs` (ตัวกรองประเภท + ค้นหา) | `/logs` (เสนอ) · `src/platform/pages/LogsPage.tsx` | ตาราง `audit_logs` ผ่าน `GET /api/admin/audit-logs` (T10: offset ตัวกรอง ยอดรวม) | ผู้ดูแล | ย้าย | ยังไม่ทำ | T10, T11 | `P-24__admin__{1440,375}.png` | 2,626 แถว (16 พ.ย.) ต้องแบ่งหน้า; ผลลัพธ์ = `status_code` < 400 |
| P-25 | view `profile` ผู้ login แท็บ `overview` → `AccountProfile` | `/profile` (เสนอ) · `src/platform/pages/ProfilePage.tsx` | `/api/auth/me` (ชื่อ อีเมล รูป Google), `/api/me/summary` (T15) | ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T16 | `P-25__{learner,instructor,admin}__{1440,375}.png` | แสดงอ่านอย่างเดียว; ไม่แสดง department/studentId/bio |
| P-26 | `AccountProfile` แท็บ `history` | `ProfilePage.tsx` แท็บประวัติ | `GET /api/me/activity` (T15) | ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T16 | `P-26__{learner,instructor,admin}__{1440,375}.png` | |
| P-27 | `AccountProfile` แท็บ `works` | `ProfilePage.tsx` แท็บผลงาน | template ของฉัน `GET /api/templates/mine` | ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T16 | `P-27__{learner,instructor,admin}__{1440,375}.png` | ส่วนงานที่ส่งแสดงสถานะว่าง |
| P-28 | `AccountProfile` แท็บ `account` (ฟอร์มแก้ไข + ปุ่ม "นำเข้าข้อมูลจากอีเมล" + `DEMO_ACCOUNTS`) | ไม่มี | ไม่มี — ใช้ข้อมูลจาก Google อ่านอย่างเดียว | ผู้เรียน, ผู้สอน, ผู้ดูแล | ตัดออก: ระบบจริงใช้ Google OAuth ไม่มีช่องแก้อีเมล ไม่มีปุ่มนำเข้าอีเมลสาธิต และไม่แสดง department/studentId/bio | ยังไม่ทำ | T16 | `P-28__{learner,instructor,admin}__{1440,375}.png` | เกณฑ์ T16 ข้อ 1 |
| P-29 | view `profile` ไม่ login → `GuestProfile` | `/profile` เมื่อไม่ login (เสนอ) | ไม่มี | ผู้เยี่ยมชม | ตัดออก: ผู้ใช้ตัดสินใจ 17 พ.ย. ให้ผู้เยี่ยมชมเห็นหน้าแรกอย่างเดียว `/profile` ตอนไม่ login พาไป Login เหมือนทุก route | ยังไม่ทำ | T7 | `P-29__guest__{1440,375}.png` | |
| P-30 | view `login` → `Login` (ปุ่ม "ดำเนินการต่อด้วย Google" แบบเดโม + ข้อความ Demo sign-in) | `/login` (เสนอ) · `src/components/LoginPage.tsx` | Google OAuth จริง `GET /api/auth/google/login` | ผู้เยี่ยมชม | ย้าย | ยังไม่ทำ | T7 | `P-30__guest__{1440,375}.png` | เหลือปุ่ม Google ปุ่มเดียว ตัดป้าย "เดโม" และข้อความจำลอง; mockup v2.2 ไม่มีฟอร์ม login ด้วยอีเมล (มีแต่ปุ่ม Google สาธิต) |
| P-31 | `Login` modal "เลือกบัญชี Google · เดโม" (รายการ `DEMO_ACCOUNTS` 6 บัญชี) | ไม่มี | ไม่มี — Google OAuth จริงเลือกบัญชีที่หน้า Google | ผู้เยี่ยมชม | ตัดออก: ใช้ Google OAuth จริง ไม่มีบัญชีสาธิต | ยังไม่ทำ | T7 | `P-31__guest__{1440,375}.png` | |

### 1.2 ส่วนร่วม modal และส่วนประกอบ

| รหัส | ตำแหน่งใน mockup | route / ไฟล์ในของจริง | แหล่งข้อมูลจริง | บทบาทที่เห็น | สถานะเป้าหมาย | สถานะปัจจุบัน | task | ภาพ mockup | หมายเหตุ |
|---|---|---|---|---|---|---|---|---|---|
| C-01 | `PlatformHeader` (`Platform.jsx`): แบรนด์ เมนูตามบทบาท ลิงก์ข้ามไปเนื้อหา | `src/platform/Header.tsx`, `src/platform/Layout.tsx` | `useAuth()` (`role`, `can_teach`) | ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T6 | `C-01__{learner,instructor,admin}__{1440,375}.png` | เมนูผู้เรียน: Dashboard Courses Templates My Submissions Lab; ผู้ดูแลเพิ่ม Users, Platform Logs (เกณฑ์ T6) |
| C-02 | `GuestHeader` (`Guest.jsx`): เมนู Dashboard/Courses/Templates/Lab + ปุ่ม Sign in | `src/platform/Header.tsx` (ตัวแปรผู้เยี่ยมชม) | ไม่มี | ผู้เยี่ยมชม | ย้าย | ยังไม่ทำ | T7 | `C-02__guest__{1440,375}.png` | เมนูที่ไม่ใช่หน้าแรกพาไป Login |
| C-03 | `GuestHeader` เมนูโปรไฟล์ผู้เยี่ยมชม (โปรไฟล์ / เข้าสู่ระบบ) | `Header.tsx` (ตัวแปรผู้เยี่ยมชม) | ไม่มี | ผู้เยี่ยมชม | ย้าย | ยังไม่ทำ | T7 | `C-03__guest__{1440,375}.png` | "โปรไฟล์" พาไป Login (ไม่มีการ์ด GuestProfile ดู P-29) |
| C-04 | กระดิ่ง `notification-popup` (รายการ + ตัวกรองทั้งหมด/ยังไม่อ่าน + อ่านทั้งหมด) | `Header.tsx` | ไม่มี — `learningApi.ts` คืนว่าง | ผู้เรียน, ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T6, T20 | `C-04__{learner,instructor,admin}__{1440,375}.png` | ของจริงเปิดแล้วเห็นสถานะว่าง ไม่มีตัวเลขค้าง; การแจ้งเตือนตัวอย่าง 18 รายการไม่ย้าย |
| C-05 | กระดิ่งสถานะว่าง ("ไม่มีการแจ้งเตือน") | `Header.tsx` | ไม่มี | ผู้เรียน, ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T6, T20 | `C-05__{learner,instructor,admin}__{1440,375}.png` | ถ่ายหลังกด "อ่านทั้งหมด" และเลือก "ยังไม่อ่าน" ซึ่งเป็นหน้าตาที่ของจริงต้องมี |
| C-06 | เมนูบัญชี `account-menu` (ชื่อ อีเมล ป้ายบทบาท โปรไฟล์ ออกจากระบบ) | `Header.tsx`, `src/components/UserMenu.tsx` | `/api/auth/me`, `POST /api/auth/logout` | ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T6 | `C-06__{learner,instructor,admin}__{1440,375}.png` | ผู้ดูแลต้องยังเปิดแผน User Management เดิมได้ (R-39) |
| C-07 | ธีมสว่าง/มืด (`state.dark`, ปุ่มพระจันทร์/อาทิตย์) | `src/platform/Header.tsx` + `src/platform/styles/Theme.css` | `localStorage` (ค่าที่ผู้ใช้เลือก) | ผู้เยี่ยมชม, ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T5, T6 | `C-07__{guest,learner,instructor,admin}__{1440,375}.png` | ถ่ายหน้า home ในธีมมืด |
| C-08 | `footer.site-footer` ("เรียนรู้ผ่านการลงมือทำ · ข้อมูลสาธิตในเบราว์เซอร์นี้") | `src/platform/Layout.tsx` | ไม่มี | ผู้เยี่ยมชม, ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T6 | `C-08__{guest,learner,instructor,admin}__{1440,375}.png` | ต้องตัดข้อความ "ข้อมูลสาธิตในเบราว์เซอร์นี้" เพราะของจริงใช้ข้อมูลจริง; ไม่แสดงใน Lab (`!labView`) |
| C-09 | toast (`.toast`, `notify()`, `startupWarning`) | `src/platform/Layout.tsx` (ตัวจัดการ toast กลาง) | ไม่มี | ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T6 | `C-09__{learner,instructor,admin}__{1440,375}.png` | ถ่ายสำเร็จ (toast "บันทึกโปรไฟล์แล้ว" ค้าง 5.5 วินาที); ผู้เยี่ยมชมไม่มี toast ที่ถ่ายได้โดยไม่ login จึงไม่ถ่าย; task ผู้รับ T6 (ผู้ใช้ยืนยัน 17 พ.ย.) |
| C-10 | modal ยืนยัน (`modal.type=confirm`, `Modal`) ตัวอย่าง: เปิด/ปิดสิทธิ์ผู้สอนในหน้า Users | `src/platform/ui.tsx` (`Modal`), `UsersPage.tsx` | ไม่มี | ผู้ดูแล | ย้าย | ยังไม่ทำ | T5, T9 | `C-10__admin__{1440,375}.png` | Modal ต้องปิดด้วย Escape กัก focus และคืน focus (เกณฑ์ T5) |
| C-11 | modal ช่วยเหลือ "เริ่มใช้ VIPER Lab" (`modal.type=help`) | ปุ่มวิธีใช้ใน `src/pages/LabPage.tsx` / `sidebar.tsx` | ข้อความคงที่ | ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T14 | `C-11__{learner,instructor,admin}__{1440,375}.png` | ต้องเขียนข้อความใหม่ให้ตรงกับ editor จริง (ตัดขั้น "ส่งงาน" และข้อความ "ผลทดลองเป็นข้อมูลจำลอง"); ผู้ใช้ยืนยัน 17 พ.ย. |
| C-12 | modal บันทึก Workflow เป็น Template (`SaveTemplateDialog` สร้างใหม่: ชื่อ คำอธิบาย การมองเห็น บทเรียนที่ผูก) | `src/platform/SaveTemplateDialog.tsx` | `POST /api/templates` (`createPlatformTemplate`) | ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T13 | `C-12__{learner,instructor,admin}__{1440,375}.png` | ช่องผูกกับบทเรียน (`lessonId`) ไม่ย้าย เพราะไม่มีบทเรียน; ตัวเลือก Official ตามสิทธิ์ T8.1 |
| C-13 | modal แก้ไข Template (`SaveTemplateDialog` แก้ของเดิม) | `TemplatesPage.tsx`, `TemplatePlatformLibrary.tsx` (editDraft เดิม) | `PATCH /api/templates/{id}`, `POST /api/templates/{id}/cover` | ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T12, T8.1 | `C-13__{learner,instructor,admin}__{1440,375}.png` | ต้องมีอัปโหลดปกและแก้ชื่อ/คำอธิบาย/การมองเห็นเหมือนของจริงเดิม (R-27, R-28) |
| C-14 | modal ยืนยันลบ Template (พิมพ์ชื่อเพื่อยืนยัน) | `TemplatesPage.tsx` / `TemplateDetail.tsx` (ปุ่มลบตามสิทธิ์) | `DELETE /api/templates/{id}` แบบ soft delete (`templates.deleted_at`, เพิ่มใน T8.1) | ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T8.1, T12 | `C-14__{learner,instructor,admin}__{1440,375}.png` | ผู้ใช้ตัดสินใจ 17 พ.ย.: admin/ผู้สอนลบ Official ได้, ผู้เรียนไม่ได้, เจ้าของลบ template ของตัวเองได้; แถวที่ลบไม่แสดงและ seed ไม่สร้างกลับ; log ทุกการลบ |
| C-15 | `TemplateDetail` (modal: ภาพ preview, คำอธิบาย, รายการโหนด, ความคิดเห็น, สวิตช์ `CommentSwitch`, `VisibilityBadge`) | `src/platform/TemplateDetail.tsx` | `GET /api/templates/{id}`, ความคิดเห็น `GET/POST/DELETE /api/templates/{id}/comments`, `PATCH` การตั้งค่าความคิดเห็น | ผู้เยี่ยมชม, ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T12 | `C-15__{guest,learner,instructor,admin}__{1440,375}.png` | ต้องมีลบคอมเมนต์ที่ mockup ไม่มี (R-30); admin เปิดปิดคอมเมนต์ (R-31); ของจริง: ผู้เยี่ยมชมถูกพาไป Login (ผู้ใช้ตัดสินใจ 17 พ.ย. เห็นหน้าแรกอย่างเดียว) ภาพ guest ของ mockup เก็บไว้อ้างอิง |
| C-16 | `LogDetail` (modal รายละเอียดเหตุการณ์ + JSON + ปุ่มไปหน้าที่เกี่ยวข้อง, `LOG_INFO`) | `LogsPage.tsx`, `AdminAuditLogView.tsx` | แถวใน `audit_logs` (`action` 18 ชนิดจริง ไม่ใช่ 22 ชนิดสมมติของ `LOG_INFO`) | ผู้ดูแล | ย้าย | ยังไม่ทำ | T11 | `C-16__admin__{1440,375}.png` | ป้ายชื่อ action ใช้ `actionLabels` เดิม; `LOG_INFO` ของ mockup (COURSE_*, LESSON_* ฯลฯ) ไม่ย้าย |
| C-17 | `SubmissionDetail` (+ `AutoCheck`, `Scene`) ในรายการงานที่ส่ง ฝั่งผู้เรียน (`LearningHistory`) และฝั่งผู้สอน (`Reviews` + แบบฟอร์มคะแนน `RUBRIC`) | `SubmissionsPage.tsx` | ไม่มี — `learningApi.ts` คืนว่าง | ผู้เรียน, ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T20 | `C-17__{learner,instructor,admin}__{1440,375}.png` | ผู้เรียนเปิดงานที่ส่งตัวอย่าง; ผู้สอน/ผู้ดูแลเห็นงานแรกในหน้า Reviews พร้อมแบบฟอร์มให้คะแนน |
| C-18 | `CourseForm` (modal สร้าง/แก้คอร์ส) | ไม่มี (ปุ่มสร้างคอร์สไม่เปิดใช้) | ไม่มี | ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T19 | `C-18__{instructor,admin}__{1440,375}.png` | |
| C-19 | `LessonEditor` (modal แก้บทเรียน + `Markdown` พรีวิว) | ไม่มี | ไม่มี | ผู้สอน, ผู้ดูแล | ว่างตามแผน | ยังไม่ทำ | T19 | `C-19__{instructor,admin}__{1440,375}.png` | |
| C-20 | Lab: คลังโหนด (`node-library`: กลุ่มโหนด Open all/Close all, ปุ่มยุบ/ขยายคลัง) | `src/components/sidebar.tsx` (รายการจาก `sidebarGroups()` ใน `nodeCatalog.ts`) | `NODE_CATALOG` + `NODE_GROUPS` (โหนดเปิดใช้ 22 ชนิด ใน 9 หมวด) | ผู้เรียน, ผู้สอน, ผู้ดูแล | ย้าย | ยังไม่ทำ | T14 | `C-20__{learner,instructor,admin}__{1440,375}.png` | ถ่ายหลังกด Open all; ต้องไม่เขียนรายการโหนดใหม่ (เกณฑ์ T14); กลุ่มที่ปิดด้วย `enabled:false` ยังไม่แสดง (R-16) |
| C-21 | Lab: canvas + `LearningNode` + `NodeParameters` + `NodeActions` (โหนดจำลองจาก `CATALOG`) | `src/FlowCanvas.tsx` + `components/nodes/*` (ของเดิม) | `NODE_CATALOG` จริง | ผู้เรียน, ผู้สอน, ผู้ดูแล | ตัดออก: ใช้ canvas และโหนดจริงของ editor เดิม ไม่ย้าย `CATALOG`/`LearningNode` | ยังไม่ทำ | T14 | `C-21__{learner,instructor,admin}__{1440,375}.png` | ถ่ายหลังเปิด template "Object Detection Starter" ใน Free Lab |
| C-22 | Lab: แผงผลลัพธ์หลังรัน (`ResultImages`, `Scene` SVG, ตัวชี้วัดจำลอง, แท็บบันทึกการทดลอง) | แผงผลลัพธ์ในโหนด + `LogPanel.tsx` (ของเดิม) | ผลจริงจาก API ประมวลผล `/api/*` | ผู้เรียน, ผู้สอน, ผู้ดูแล | ตัดออก: ผลจำลองและภาพ SVG ไม่ย้าย ใช้ผลจริงของ editor เดิม | ยังไม่ทำ | T14 | `C-22__{learner,instructor,admin}__{1440,375}.png` | |
| C-23 | Lab: แท็บเปรียบเทียบรอบ (`RunComparison`, เก็บ 25 รอบ) | ไม่มี | ไม่มี — editor จริงไม่เก็บรอบเทียบ และผลมาจาก `simulate` | ผู้เรียน, ผู้สอน, ผู้ดูแล | ตัดออก: ผลเปรียบเทียบมาจากข้อมูลจำลอง ไม่มีข้อมูลจริงรองรับ | ยังไม่ทำ | T14 | `C-23__{learner,instructor,admin}__{1440,375}.png` | ผู้ใช้ยืนยัน 17 พ.ย.; ถ้าต้องการให้เป็นฟีเจอร์ใหม่ต้องเป็นงานรอบถัดไป |
| C-24 | Lab: มุมมองรายการโหนดบนจอแคบ (`mobileList`, ปุ่ม "เปลี่ยนเป็นรายการโหนด") | ไม่มี (editor จริงมีโหมด `compact-mobile` ของตัวเองใน `App.tsx`) | ไม่มี | ผู้เรียน, ผู้สอน, ผู้ดูแล | ตัดออก: editor จริงใช้ canvas + โหมด compact-mobile เดิม ไม่ย้ายมุมมองรายการ | ยังไม่ทำ | T14, T24 | `C-24__{learner,instructor,admin}__375.png` | ถ่ายเฉพาะ 375 (ปุ่มนี้แสดงบนจอแคบ); ผู้ใช้ยืนยัน 17 พ.ย. |
| C-25 | บล็อก "สลับบัญชีสาธิต" ในเมนูบัญชี (`demo-switch`, `switchAccount`) | ไม่มี | ไม่มี — ใช้ Google OAuth จริง | ผู้เรียน, ผู้สอน, ผู้ดูแล | ตัดออก: เป็นของเดโมเท่านั้น (ตามแผน) | ยังไม่ทำ | T6 | `C-25__{learner,instructor,admin}__{1440,375}.png` | เกณฑ์ T6 ข้อ 2: ไม่มีปุ่มสลับบัญชีสาธิต; Logout เรียก `/api/auth/logout` จริง |

## ส่วนที่ 2: ของจริง → mockup (ความสามารถเดิมที่ต้องไม่หาย)

ตรวจใน T23 (ใช้ `/lab` และหน้าที่แทนแผง admin เดิม) บันทึกผลรายข้อในคอลัมน์สถานะ: `ยังไม่ตรวจ` → `ผ่าน` / `ไม่ผ่าน` (+หมายเหตุ)

| รหัส | ความสามารถ | ไฟล์ในของจริง | วิธีตรวจ | สถานะ | task ที่ตรวจ |
|---|---|---|---|---|---|
| R-01 | แท็บ Workflow หลายแท็บ: เพิ่ม สลับ ปิด เปลี่ยนชื่อ (คลิกขวา) | `src/App.tsx`, `src/components/WorkflowTabs.tsx` | เปิด `/lab` เพิ่มแท็บ 2 แท็บ สลับ เปลี่ยนชื่อ ปิด ตรวจว่างาน/โหนดของแต่ละแท็บไม่ปนกัน | ยังไม่ตรวจ | T23 |
| R-02 | แท็บและแท็บที่ใช้อยู่คงอยู่หลัง refresh (`n2n_app_tabs`, ค่าแท็บ active) | `src/App.tsx` | วางโหนด refresh หน้า `/lab` ต้องได้ workflow เดิม สถานะโหนดกลับเป็น idle | ยังไม่ตรวจ | T23 |
| R-03 | Undo / Redo (ประวัติสแนปช็อต) | `src/hooks/useFlowHistory.ts` | วางโหนด 2 ตัว Undo ทีละขั้น Redo กลับ | ยังไม่ตรวจ | T23 |
| R-04 | Hotkey: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Delete/Backspace ลบโหนด (ไม่ทำงานตอนพิมพ์ในช่อง) | `src/hooks/useFlowHotkeys.ts` | เลือกโหนดแล้วกด Delete; พิมพ์ในช่องพารามิเตอร์แล้วกด Backspace ต้องไม่ลบโหนด | ยังไม่ตรวจ | T23 |
| R-05 | คัดลอก/วางโหนด (Ctrl/Cmd+C/V) วางที่ตำแหน่งเมาส์ | `src/hooks/useFlowHotkeys.ts` | เลือกโหนด 2 ตัวที่ต่อกัน คัดลอก วาง ต้องได้เส้นเชื่อมระหว่างโหนดที่ถูกคัดลอกด้วย | ยังไม่ตรวจ | T23 |
| R-06 | Save workflow เป็นไฟล์ JSON | `src/hooks/useWorkflowFile.ts`, `src/FlowCanvas.tsx` | กดปุ่ม Save ได้ไฟล์ `<ชื่อแท็บ>.json` ที่เปิดกลับได้ | ยังไม่ตรวจ | T23 |
| R-07 | Load workflow จากไฟล์ JSON | `src/hooks/useWorkflowFile.ts`, `src/FlowCanvas.tsx` | กด Load เลือกไฟล์จาก R-06 ต้องได้โหนดและเส้นครบ | ยังไม่ตรวจ | T23 |
| R-08 | ล้าง workflow (ปุ่ม Clear) | `src/FlowCanvas.tsx` | กด Clear ต้องล้าง canvas และ Undo กู้คืนได้ | ยังไม่ตรวจ | T23 |
| R-09 | Fit view, Controls (ซูม), MiniMap, พื้นหลังจุด | `src/FlowCanvas.tsx` | ปุ่ม Fit workflow ทำงาน ซูมเข้าออกได้ มี MiniMap | ยังไม่ตรวจ | T23 |
| R-10 | Log panel (บันทึกเหตุการณ์การรัน + ล้าง log) | `src/components/LogPanel.tsx`, `src/FlowCanvas.tsx` | รันโหนดแล้วเห็น log; กด Clear logs แล้วว่าง | ยังไม่ตรวจ | T23 |
| R-11 | รันทั้งหมด (Start) และหยุด (Stop) ตามลำดับ `order` | `src/components/WorkflowControls.tsx`, `src/App.tsx`, `src/FlowCanvas.tsx` | ต่อ Image Input → ORB แล้วกด Start ได้สถานะ success; กด Stop ระหว่างรันหยุดได้ | ยังไม่ตรวจ | T23 |
| R-12 | รันทีละโหนด และยกเลิกทีละโหนด | `src/FlowCanvas.tsx` (`runNodeById`, `cancelNodeById`) | กดปุ่มรันบนโหนดเดียว; ยกเลิกโหนดที่กำลังรัน | ยังไม่ตรวจ | T23 |
| R-13 | ลำดับรันและกติกา pipeline (`order`, `settleMs`, `runsInPipeline:false` ของ Saver, `upstreamChangeNote`) | `src/lib/nodeCatalog.ts`, `src/lib/runners/utils.tsx` | รันทั้งหมดแล้ว Save Image/Save JSON ไม่ถูกรันเอง; แก้โหนดต้นทางแล้วโหนด YOLO Dataset คงข้อมูลเดิม | ยังไม่ตรวจ | T23 |
| R-14 | กฎการเชื่อมต่อโหนด (ชนิดข้อมูล `DataKind`, ห้ามวงจร) | `src/lib/validation.ts` | ลองต่อ Image Input เข้า BFMatcher (ต้องปฏิเสธ) และต่อวนกลับ (ต้องปฏิเสธ) | ยังไม่ตรวจ | T23 |
| R-15 | คลังโหนด 22 ชนิด ใน 9 หมวด (Open all / Close all) | `src/components/sidebar.tsx`, `src/lib/nodeCatalog.ts` | จำนวนโหนดในคลังเท่ากับ `sidebarGroups()` และลากลง canvas ได้ทุกตัว | ยังไม่ตรวจ | T23 |
| R-16 | กลุ่มโหนดที่ซ่อนด้วย `enabled:false` (Enhancement, Restoration, Segmentation รวม 9 ชนิด) ยังอยู่ครบและเปิดกลับได้ | `src/lib/nodeCatalog.ts` (`NODE_GROUPS`), `components/nodes/*`, `lib/runners/*`, `server/routers/*` | ตั้งค่า `enabled:true` ชั่วคราวใน `NODE_GROUPS` แล้วคลังต้องแสดงกลุ่มนั้น จากนั้นคืนค่า | ยังไม่ตรวจ | T23 |
| R-17 | แท็บ Templates ในแถบข้าง (Official / Public / Private) และปุ่ม Load Template | `src/components/sidebar.tsx`, `src/components/TemplatePlatformLibrary.tsx` | โหลด template แล้วเปิดเป็นแท็บใหม่ของ editor | ยังไม่ตรวจ | T23 |
| R-18 | รายการ template แบบเก่าที่ซ่อนด้วย `SHOW_LEGACY_TEMPLATE_LIST` + เมนูคลิกขวา | `src/components/sidebar.tsx`, `src/components/TemplateContextMenu.tsx` | ตั้งค่าคงที่เป็น `true` ชั่วคราว รายการต้องกลับมาและคลิกขวาได้ จากนั้นคืนค่า ห้ามลบบล็อก | ยังไม่ตรวจ | T23 |
| R-19 | หน้า About Algorithm (modal ข้อมูลอัลกอริทึม) | `src/components/modals/AlgorithmInfoModal.tsx`, `src/lib/templateInfo.ts` | เปิดผ่านเมนูคลิกขวาของรายการเก่า (R-18) ได้ | ยังไม่ตรวจ | T23 |
| R-20 | เปิด template เป็นแท็บใหม่ใน editor (`handleLoadTemplate`) | `src/App.tsx` | เปิด "Homography Estimation" ได้โหนดและเส้นครบ | ยังไม่ตรวจ | T23 |
| R-21 | โหนดทั้ง 22 ชนิดทำงานผ่านตัวรันและ API จริง | `src/components/nodes/*`, `src/lib/runners/*`, `src/lib/nodeRegistry.tsx`, `src/lib/api.ts` | รัน ORB, Otsu, PSNR, Homography ผ่าน (เกณฑ์ T23) | ยังไม่ตรวจ | T23 |
| R-22 | นำเข้าพารามิเตอร์ต่อโหนดจากไฟล์ JSON (`ParameterLoader`) | `src/components/ParameterLoader.tsx` | นำเข้าพารามิเตอร์ของโหนดหนึ่งตัวจากไฟล์แล้วค่าเปลี่ยน | ยังไม่ตรวจ | T23 |
| R-23 | อัปโหลดภาพเข้า Image Input / Multi Image Input | `src/components/nodes/ImageInputNode.tsx`, `MultiImageInputNode.tsx`, `src/lib/api.ts` (`/api/upload`) | อัปโหลดภาพ 1 ภาพและหลายภาพแล้วเห็นตัวอย่าง | ยังไม่ตรวจ | T23 |
| R-24 | Save Image และ Save JSON (ดาวน์โหลดผลลัพธ์) | `src/components/nodes/SaveImageNode.tsx`, `SaveJsonNode.tsx`, `src/lib/runners/saver.ts` | ต่อโหนด Save ท้าย pipeline แล้วกดบันทึกได้ไฟล์ | ยังไม่ตรวจ | T23 |
| R-25 | เทรน YOLO แบบงานเบื้องหลัง: เริ่ม ดูสถานะ ยกเลิก | `src/components/nodes/YoloNodes.tsx`, `src/lib/api.ts` (`startYOLOTrain`, `cancelYOLOTrain`) | เริ่มงานเทรนขนาดเล็กแล้วยกเลิกได้ (ถ้าสภาพแวดล้อมรองรับ ไม่งั้นบันทึกว่าตรวจด้วยเทสต์ BE) | ยังไม่ตรวจ | T23 |
| R-26 | Official template 9 รายการเปิดได้และมี workflow ใน DB | `server/official_templates.json`, `server/official_templates.py`, `src/lib/templateInfo.ts` | เปิดครบ 9 รายการ; รันผ่าน ORB, Otsu, PSNR, Homography | ยังไม่ตรวจ | T23 |
| R-27 | สร้าง template และแก้ชื่อ/คำอธิบาย | `src/components/TemplatePlatformLibrary.tsx`, `src/lib/templateApi.ts` | บันทึกจาก Lab เห็นในแท็บของฉัน; แก้ชื่อแล้วเปลี่ยนจริง | ยังไม่ตรวจ | T23 |
| R-28 | อัปโหลดปก template | `src/components/TemplatePlatformLibrary.tsx` (`uploadTemplateCover`), `server/routers/templates.py` | อัปโหลดภาพปกแล้วแสดงในรายการ; เกิด log `template.cover_update` | ยังไม่ตรวจ | T23 |
| R-29 | เขียนความคิดเห็นใน template | `src/components/TemplatePlatformLibrary.tsx` (`createTemplateComment`) | เขียนแล้วเห็นทันที เกิด log `comment.create` | ยังไม่ตรวจ | T23 |
| R-30 | ลบความคิดเห็น (มีกล่องยืนยัน) | `src/components/TemplatePlatformLibrary.tsx` (`deleteTemplateComment`), `server/routers/templates.py` | ลบแล้วหายและเกิด log `comment.delete` (mockup ไม่มีฟีเจอร์นี้) | ยังไม่ตรวจ | T23 |
| R-31 | admin เปิด/ปิดรับความคิดเห็นของ template | `src/components/TemplatePlatformLibrary.tsx` (`updateTemplateCommentsSetting`) | ปิดแล้วเขียนใหม่ไม่ได้ เกิด log `permission.comments_update` | ยังไม่ตรวจ | T23 |
| R-32 | เปลี่ยนการมองเห็น template (private/public) | `src/components/TemplatePlatformLibrary.tsx` (`changeVisibility`) | สลับแล้วย้ายแท็บถูกต้อง เกิด log `permission.template_visibility_update` | ยังไม่ตรวจ | T23 |
| R-33 | เปลี่ยน role ผู้ใช้ (admin/user) | `src/components/AdminUserPanel.tsx`, `src/lib/adminApi.ts` | เปลี่ยน role ผู้ใช้ทดสอบแล้วเกิด log `permission.role_update` และคืนค่า | ยังไม่ตรวจ | T23 |
| R-34 | แบนแบบมีวันหมดอายุ (ตัวเลือกระยะเวลา) และยกเลิกแบน | `src/components/AdminUserPanel.tsx` (`banOptions`, `banForDuration`) | แบนผู้ใช้ทดสอบ 1 ช่วงเวลา เห็นวันหมดอายุ แล้วยกเลิกแบน เกิด log `ban.apply`, `ban.remove` | ยังไม่ตรวจ | T23 |
| R-35 | บัญชีที่ถูกแบนถูกกัน และแบนหมดอายุเองตามเวลา | `src/auth/AuthContext.tsx` (event `viper:account-banned`), `src/components/AuthGate.tsx`, `server/auth.py` | login ด้วยบัญชีที่ถูกแบนต้องเข้าไม่ได้; เทสต์ BE `tests/test_auth.py` ผ่าน | ยังไม่ตรวจ | T23 |
| R-36 | ดูประวัติ Audit log: กรอง 7 หมวด (Login, Template, Comment, Ban, Permission, Processing) และป้ายชื่อ action | `src/components/AdminAuditLogView.tsx`, `src/lib/adminApi.ts` | เปิดจากแผง admin/หน้า Logs แล้วกรองแต่ละหมวดได้ | ยังไม่ตรวจ | T23 |
| R-37 | บันทึก Audit log ของทุกการกระทำฝั่ง server (login/logout, template, comment, ban, permission, processing) | `server/audit.py`, `server/routers/*` | ทำการกระทำแล้วมีแถวใน `audit_logs`; `pytest tests/test_admin_audit_logs.py` ผ่าน | ยังไม่ตรวจ | T23 |
| R-38 | Login/Logout ด้วย Google OAuth และ AuthGate | `src/auth/AuthContext.tsx`, `src/components/AuthGate.tsx`, `src/components/LoginPage.tsx`, `server/routers/auth.py` | login ด้วย Google ได้ ออกจากระบบแล้วกลับหน้า Login | ยังไม่ตรวจ | T23 |
| R-39 | เมนูผู้ใช้เดิม: อวตาร ชื่อ role ปุ่มเปิด User Management (admin) และ Log out | `src/components/UserMenu.tsx`, `src/components/AdminUserPanel.tsx` | ผู้ดูแลยังเปิดแผนจัดการผู้ใช้ได้จาก header ใหม่หรือหน้า Users | ยังไม่ตรวจ | T23 |
| R-40 | โหมด compact-mobile ของ editor (จอแคบ ≤767px) | `src/App.tsx` (`COMPACT_MOBILE_QUERY`), `src/FlowCanvas.tsx` | เปิด `/lab` ที่ 375px ใช้งาน editor ได้ ปุ่มไม่ทับกัน | ยังไม่ตรวจ | T23, T24 |
| R-41 | ผลลัพธ์ในโหนด (ภาพ ตัวชี้วัด payload) และการเก็บ payload ย่อไว้หลัง refresh | `src/lib/nodeResult.ts`, `src/App.tsx` | รันโหนดมีภาพ refresh แล้วโหนดถัดไปยังอ่านผลต่อได้ | ยังไม่ตรวจ | T23 |
| R-42 | Seed Official template ตอนเริ่ม server (ไม่ซ้ำ ไม่สร้างทับ) | `server/official_templates.py`, `server/main.py` | เริ่ม server ซ้ำแล้ว Official ยังเป็น 9 แถว มี workflow | ยังไม่ตรวจ | T23 |

## ส่วนที่ 3: ตรวจความครบ (component/function ใน source ของ mockup ทุกตัวต้องมีแถว)

นับจาก `outputs/viper-learning-v2/src/*.jsx` ด้วยการค้น `function`/`const` ระดับบนสุดของแต่ละไฟล์ ชื่อทุกตัวต้องปรากฏในตารางนี้ ตรวจอัตโนมัติด้วย `./.venv/bin/python scripts/parity_screenshots.py --check` ("ใช้ในแถว" ที่เขียน "ไม่ใช่หน้าจอ" = ตรรกะ/ข้อมูล/ตัวช่วยที่ไม่มีหน้าตาของตัวเอง)

สรุปจำนวน (นับเมื่อ 17 พ.ย. 2569): `Platform.jsx` 12 ตัว (export 7), `Learning.jsx` 12 ตัว (export 10), `Teaching.jsx` 6 ตัว (export 3), `Guest.jsx` 3 ตัว (export 3), `App.jsx` 28 ตัว (function 23 + const 5), `ui.jsx` 10 ตัว (export 9) รวม 71 ตัว

### Platform.jsx

| ชื่อ | ชนิด | export | ใช้ในแถว |
|---|---|---|---|
| `Login` | component | ใช่ | P-30, P-31 |
| `PlatformHeader` | component | ใช่ | C-01, C-04, C-05, C-06, C-07, C-25 |
| `VisibilityBadge` | component | ไม่ | C-15 (ป้ายในแถว P-22 และ C-15) |
| `TemplateLibrary` | component | ใช่ | P-22 |
| `CommentSwitch` | component | ไม่ | C-15 |
| `TemplateDetail` | component | ไม่ | C-15 |
| `SaveTemplateDialog` | component | ใช่ | C-12, C-13, C-14 |
| `LOG_INFO` | ข้อมูลป้าย action | ไม่ | C-16 (ไม่ใช่หน้าจอ: ตารางป้ายชื่อ; ของจริงใช้ `actionLabels`) |
| `LogDetail` | component | ไม่ | C-16 |
| `PlatformLogs` | component | ใช่ | P-24 |
| `AdminUsers` | component | ใช่ | P-23, C-10 |
| `AccountProfile` | component | ใช่ | P-25, P-26, P-27, P-28 |

### Learning.jsx

| ชื่อ | ชนิด | export | ใช้ในแถว |
|---|---|---|---|
| `SubjectHeading` | component | ใช่ | ไม่ใช่หน้าจอ: คืนค่า children หรือ null ไม่มีหน้าตา (ใช้ในหน้าเรียนทุกหน้า) |
| `lessonSubmission` | ตัวช่วยข้อมูล | ใช่ | ไม่ใช่หน้าจอ: เลือกงานที่ส่งล่าสุด ใช้ใน P-07, P-17 |
| `CourseTabs` | component | ใช่ | P-05 (แท็บ "คอร์สทั้งหมด/คอร์สที่ฉันสอน" เฉพาะผู้สอน) |
| `COURSE_STATUS` | ข้อมูลป้ายสถานะคอร์ส | ใช่ | ไม่ใช่หน้าจอ: ป้าย Draft/Published/Archived ใช้ใน P-05, P-06, P-09, P-11 |
| `LessonState` | component | ไม่ | P-06 (ป้ายสถานะบทเรียน; รวมอยู่ในแถว P-06, P-07) |
| `useEnroll` | hook | ไม่ | ไม่ใช่หน้าจอ: ปุ่มลงทะเบียนใน P-05, P-06 |
| `CourseCatalog` | component | ใช่ | P-05 |
| `CoursePage` | component | ใช่ | P-06 |
| `LessonPage` | component | ใช่ | P-07, P-08 |
| `LearningTimeline` | component | ใช่ | P-02 (พาเนล "งานและกำหนดส่ง" ในแดชบอร์ดผู้เรียน) |
| `Gradebook` | component | ใช่ | P-19, P-20 |
| `Announcements` | component | ใช่ | P-21 |

### Teaching.jsx

| ชื่อ | ชนิด | export | ใช้ในแถว |
|---|---|---|---|
| `CourseForm` | component | ไม่ | C-18 |
| `TeachHome` | component | ใช่ | P-09, P-10 |
| `LessonEditor` | component | ไม่ | C-19 |
| `CourseEditor` | component | ใช่ | P-11 |
| `ListEditor` | component | ไม่ | P-12 (รายการขั้นตอน/คำใบ้ในแผงออกแบบ) |
| `DesignerPanel` | component | ใช่ | P-12 |

### Guest.jsx

| ชื่อ | ชนิด | export | ใช้ในแถว |
|---|---|---|---|
| `GuestHeader` | component | ใช่ | C-02, C-03 |
| `GuestHome` | component | ใช่ | P-01 |
| `GuestProfile` | component | ใช่ | P-29 |

### App.jsx

| ชื่อ | ชนิด | ใช้ในแถว |
|---|---|---|
| `ICONS` | ตารางไอคอน | ไม่ใช่หน้าจอ: แมปชื่อไอคอนของ `CATALOG` (ตัดออกพร้อม C-21) |
| `LAB_VIEWS` | ค่าคงที่ | ไม่ใช่หน้าจอ: รายชื่อ view ที่เป็น Lab (`lab`, `design`) ใช้ใน P-12, P-13 |
| `TEACH_VIEWS` | ค่าคงที่ | ไม่ใช่หน้าจอ: รายชื่อ view ที่ต้องมีสิทธิ์ผู้สอน ใช้ใน P-10 |
| `designWork` | ตัวช่วยข้อมูล | ไม่ใช่หน้าจอ: สร้างพื้นที่ทำงานโหมดออกแบบ (P-12) |
| `initialWork` | ตัวช่วยข้อมูล | ไม่ใช่หน้าจอ: พื้นที่ทำงานตั้งต้นของ Lab (P-13 ถึง P-15) |
| `App` | component รากและ router (`view` state, Provider, toast, modal) | P-01 ถึง P-31 (การเปลี่ยนหน้า), C-08, C-09, C-10, C-11, C-12 |
| `Dashboard` | component | P-02 |
| `MiniWorkflow` | component | P-01 (ภาพ preview), C-15 (preview ใน TemplateDetail) |
| `PanelResizeHandle` | component | P-13 (แถบลากปรับขนาดแผงใน Lab ทุกโหมด; รวมกับ C-20, C-22) |
| `NodeEditorContext` | context | ไม่ใช่หน้าจอ: context ของโหนดจำลอง (ตัดออกพร้อม C-21) |
| `NodeParameters` | component | C-21 |
| `NodeActions` | component | C-21 |
| `LearningNode` | component | C-21 |
| `nodeTypes` | ตารางชนิดโหนด | ไม่ใช่หน้าจอ: แมป `learning` ไป `LearningNode` (C-21) |
| `LabGate` | component | P-12 ถึง P-16 (เลือกโหมดและสิทธิ์) |
| `Lab` | component | P-12 ถึง P-15, C-11, C-20 ถึง C-24 |
| `AutoCheck` | component | C-17, P-14 (ผลตรวจอัตโนมัติ; รวมใน P-14) |
| `GuideStep` | component | P-14 (ขั้นตอนในแผงโจทย์ฝั่งขวา) |
| `Scene` | component | C-22, C-17, P-25 (ภาพ SVG จำลอง; ตัดออกพร้อม C-22) |
| `ResultImages` | component | C-22 |
| `RunComparison` | component | C-23 |
| `SubmissionsHub` | component | P-17 ถึง P-20 (ตัวสลับแท็บ My Submissions / Grades) |
| `LearningHistory` | component | P-17 |
| `SubmissionDetail` | component | C-17 |
| `Stat` | component | P-03, P-04 (การ์ดตัวเลข) |
| `InstructorDashboard` | component | P-03 |
| `Reviews` | component | P-18 |
| `AdminDashboard` | component | P-04 |

### ui.jsx

| ชื่อ | ชนิด | ใช้ในแถว |
|---|---|---|
| `Ctx` | context | ไม่ใช่หน้าจอ: context กลางของ mockup (ของจริงใช้ `useAuth()` และ router แทน) |
| `useApp` | hook | ไม่ใช่หน้าจอ: อ่าน `Ctx` |
| `cx` | ตัวช่วย | ไม่ใช่หน้าจอ: รวม className |
| `time` | ตัวช่วย | ไม่ใช่หน้าจอ: จัดรูปแบบเวลาไทย (ใช้ในทุกหน้าที่มีเวลา) |
| `Button` | component | T5: ใช้ทุกแถว (รวม P-30, C-12) |
| `Badge` | component | T5: ใช้ทุกแถว (รวม C-06, P-22) |
| `Empty` | component | T5: สถานะว่างของ P-05 ถึง P-21, C-04, C-05 |
| `Modal` | component | C-10, C-12, C-13, C-14, C-15, C-16, C-18, C-19, P-31 |
| `inline` | ตัวช่วย | ไม่ใช่หน้าจอ: แปลง `**ตัวหนา**` ใน `Markdown` (C-19, P-07) |
| `Markdown` | component | C-19, P-07 (เนื้อหาบทเรียน) |

### ไฟล์ตรรกะและข้อมูล (ไม่ใช่หน้าจอ)

| ไฟล์ | บทบาท | ใช้ในแถว |
|---|---|---|
| `engine.mjs` | `CATALOG` โหนดจำลอง, `simulate`, ตรวจโครงสร้าง, state เริ่มต้นใน `localStorage` (`viper-learning-demo-v2.2`) | ไม่ใช่หน้าจอ: ไม่ย้าย (แทนด้วย editor และ API จริง); ปรากฏใน C-21, C-22 |
| `platform.mjs` | `DEMO_ACCOUNTS`, สิทธิ์, คอร์ส/บทเรียน/กิจกรรม/งานที่ส่ง/ประกาศ/log ตัวอย่าง | ไม่ใช่หน้าจอ: ข้อมูลตัวอย่างไม่ย้าย; โครงสิทธิ์แทนด้วย `role` + `can_teach`; ปรากฏใน P-30, P-31, C-25 |
| `App.css`, `Platform.css`, `Learning.css`, `Theme.css`, `Density.css` | สไตล์ | T5 ย้ายมาครอบ `.viper-platform` (ไม่มีแถวของตัวเอง) |
