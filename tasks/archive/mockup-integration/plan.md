# แผนนำ Mockup v2 ไปลงใน VIPER จริง

จัดทำ 14 พฤศจิกายน 2569 · ปรับตามโค้ดหลัง refactor (commit `ab4e0513`) 16 พฤศจิกายน 2569 · branch `learning-platform`
ต้นทาง: `outputs/viper-learning-platform-v2.html` (source อยู่ที่ `outputs/viper-learning-v2/src/`)
ปลายทาง: `my-react-flow-app/` (React 19 + TypeScript + Tailwind) และ `server/` (FastAPI + PostgreSQL)
รายการ task แบบละเอียด: [todo.md](todo.md)

## ภาพรวม

ย้ายหน้าตา ลำดับหน้า และเมนูของ mockup v2 เข้าแอป VIPER จริง แล้วต่อทุกหน้ากับข้อมูลที่มีอยู่แล้วในระบบ (โหนด, Template, ผู้ใช้, Audit log, คอมเมนต์) ส่วนที่ระบบจริงยังไม่มีข้อมูล (คอร์ส บทเรียน งานที่ส่ง คะแนน ประกาศ การแจ้งเตือน) ให้แสดงเป็นหน้าว่างพร้อมข้อความบอกสถานะ ยังไม่สร้างเนื้อหาและยังไม่สร้างตารางใหม่ ก่อนปิดงานต้องมีรายงานเปรียบเทียบ mockup กับของจริงทั้งด้านหน้าจอและด้านข้อมูล

แผนนี้มาแทนลำดับงานใน `docs/mockup-v2-review-and-build-plan.md` (แผน D0–D8) เฉพาะส่วน "ย้ายหน้าจอ + ข้อมูลจริง" ส่วนการสร้างระบบคอร์สและบทเรียนทดสอบในแผนเดิมยังใช้ได้ และจะเป็นงานรอบถัดไปหลังแผนนี้จบ หมายเหตุ: แผนเดิมบางข้อล้าสมัยแล้ว เพราะ mockup ปัจจุบันมี `canTeach`, การลงทะเบียน, สถานะ Draft/Published และตัวแก้คอร์สแล้ว (เทสต์ 37 รายการ)

## เส้นฐานที่วัดไว้ (14 พ.ย. 2569, วัดซ้ำหลัง refactor 16 พ.ย. 2569)

| รายการ | ค่า |
|---|---|
| Backend tests (`pytest --ignore=tests/compare_yolo`) | ผ่าน 259, ล้ม 15 (SURF ทั้งหมด: `test_surf.py` 14, `test_bfmatcher.py` 1) — refactor เพิ่ม `tests/test_node_defaults.py` 14 ตัว |
| Mockup tests (`node --test`) | ผ่าน 37 / 37 |
| Frontend `tsc -b` และ `npm run build` | ผ่าน |
| Frontend `node --test tests/yoloModel.test.cjs` | ผ่าน 4 / 4 |
| Frontend `npm run lint` | 3 errors (`sidebar.tsx:284`), 1 warning (`FlowCanvas.tsx:509`) |
| `users` | 4 แถว (admin 1, user 2, บัญชีระบบ `VIPER Official` 1) |
| `templates` | 13 แถว (official 9, public 3, private 1) — official ทั้ง 9 แถวมี workflow ใน DB แล้ว (ดูหมายเหตุด้านล่าง) |
| `comments` | 1 แถว |
| `audit_logs` | 2,626 แถว เมื่อ 16 พ.ย. (14 พ.ย. นับได้ 2,605, 18 ชนิด action, `processing.run` 2,369) เพิ่มตามการใช้งานจริง |
| `results` | 31 แถว (ไม่มีเจ้าของ) |
| `images` | 0 แถว |
| โหนด (`src/lib/nodeCatalog.ts`) | 31 ชนิด ใน 12 หมวด: เปิดใช้ 22 ชนิด ใน 9 หมวด, ซ่อน 9 ชนิด (Enhancement, Restoration, Segmentation) ด้วย `enabled: false` ที่ `NODE_GROUPS` |
| Official template (seed `server/official_templates.json`) | 12 รายการ: เปิดใช้ 9 ตรงกับ `official_key` 9 แถวในฐานข้อมูล, ซ่อน 3 (`"enabled": false`) |

**หมายเหตุหลัง refactor (16 พ.ย.)**

- backend ที่รันด้วย `uvicorn --reload` โหลดโค้ดหลัง refactor แล้วและเติม workflow ให้ Official template 9 แถวในฐานข้อมูลจริงไปแล้ว (เติมเฉพาะแถวที่ workflow ว่าง ไม่มีแถวหาย) ไฟล์สำรองใน T1 จึงเป็นสถานะหลังเติม ไม่ใช่สถานะก่อน refactor
- ข้อเท็จจริงที่ task ต่อไปใช้: workflow ของ Official template อยู่ในฐานข้อมูล โหลดผ่าน `POST /api/templates/{id}/load` ทางเดียวกับ template อื่น (ลบ `lib/templates/` และ `lib/workflowTemplates.ts` แล้ว), ข้อความ "About Algorithm" อยู่ที่ `src/lib/templateInfo.ts`, คลังโหนดใน sidebar สร้างจาก `sidebarGroups()` ใน `nodeCatalog.ts`
- ข้อห้ามจากการ refactor ที่ยังใช้: ห้ามลบโหนด template หรือความสามารถใด แม้จะซ่อนหรือใช้ไม่ได้อยู่ รวมถึงรายการ template แบบเก่าที่ซ่อนใน `sidebar.tsx` ซึ่งเป็นทางเดียวที่เปิดหน้า "About Algorithm" ได้

## การจับคู่ข้อมูล mockup กับของจริง

| ข้อมูลใน mockup | ของจริงที่ใช้แทน | สิ่งที่ต้องทำ |
|---|---|---|
| โหนดจำลอง 12 ชนิด (`CATALOG`) | โหนดจริงที่เปิดใช้ 22 ชนิด (`NODE_CATALOG` + `NODE_GROUPS` ใน `nodeCatalog.ts`) | ใช้ editor เดิมทั้งชุด ไม่ย้าย `CATALOG` และ `simulate` |
| Template 8 รายการ (official/public/private) | ตาราง `templates` 13 แถว (workflow ของ Official อยู่ใน DB แล้ว) | ใช้ `templateApi.ts` เดิม; `official` = `is_official`; ลบ = soft delete `deleted_at` (T8.1) |
| คอมเมนต์ใน template | ตาราง `comments` | ใช้ endpoint เดิม รวมการลบคอมเมนต์ที่ mockup ไม่มี |
| บัญชีตัวอย่าง 6 บัญชี | ตาราง `users` 4 แถว | `active` = `status`, `lastSeen` = `last_login_at`, `joinedAt` = `created_at` |
| `canTeach` | ยังไม่มี | เพิ่มคอลัมน์ `users.can_teach` (ค่าเริ่มต้น false) และใช้กับสิทธิ์ Official template (T8.1) |
| `department`, `studentId`, `bio` | ไม่มี | ไม่แสดงในรอบนี้ (ดูคำถามข้อ 2) |
| Platform Logs (4 รายการตัวอย่าง) | ตาราง `audit_logs` 2,626 แถว | เพิ่มการแบ่งหน้าและตัวกรองที่ API เพราะตอนนี้ดึงได้สูงสุด 500 แถว |
| การทดลองล่าสุด / ประวัติของฉัน | `audit_logs` ของผู้ใช้เอง | เพิ่ม endpoint `/api/me/activity` |
| Login อีเมล + Google สาธิต, สลับบัญชี | Google OAuth จริง | ตัด login อีเมลและปุ่มสลับบัญชี |
| คอร์ส บทเรียน กิจกรรม Lab การลงทะเบียน | ไม่มี | หน้าว่าง ไม่สร้างตาราง |
| งานที่ส่ง ผลตรวจ คะแนน Rubric | ไม่มี | หน้าว่าง |
| ประกาศ การแจ้งเตือน | ไม่มี | หน้าว่าง / กระดิ่งไม่มีรายการ |
| ภาพผลลัพธ์ SVG และ Metrics จากสูตร | ผลจริงจาก API ประมวลผล | ใช้แผงผลลัพธ์ของ editor เดิม |

## การตัดสินใจหลัก

1. **Lab คือ editor ตัวจริง** ย้าย `App.tsx` ปัจจุบันไปเป็นหน้า `/lab` โดยไม่เขียนใหม่ เก็บแท็บ Workflow, undo/redo, hotkey, Save/Load ไฟล์, Log panel และ runner ทั้งหมด เหตุผล: โหนดจริงและการรันจริงอยู่ที่นี่ และ mockup เองก็ออกแบบหน้า Lab ให้อิงตัวจริงอยู่แล้ว
2. **ย้าย CSS ของ mockup มาทั้งไฟล์โดยครอบ scope** (`Theme.css`, `Density.css`, `Platform.css`, `Learning.css`) ใต้ class `.viper-platform` ไม่แปลงเป็น Tailwind เหตุผล: ต้องการให้หน้าตาตรง mockup เพื่อให้เทียบได้ตรงๆ ส่วนหน้า Lab ยังใช้ Tailwind เดิม ต่างจากข้อเสนอในแผน D0–D8 ที่ให้ย้ายเฉพาะ token
3. **เพิ่ม `react-router-dom`** แทนตัวแปร `view` ของ mockup เพื่อให้ refresh และแชร์ลิงก์ได้ และให้สคริปต์ถ่ายภาพเปิดแต่ละหน้าได้โดยตรง
4. **ไม่สร้างตารางคอร์สในรอบนี้** หน้าที่เกี่ยวกับคอร์สอ่านข้อมูลผ่าน `learningApi.ts` ไฟล์เดียวที่คืนรายการว่าง เมื่อทำระบบคอร์สจริงจะแก้ที่ไฟล์นี้จุดเดียว ปุ่มสร้างคอร์สและตัวออกแบบ Lab จะยังไม่เปิดใช้
5. **ห้ามเสียความสามารถเดิม** สิ่งที่ของจริงมีแต่ mockup ไม่มี ต้องอยู่ครบ: แบนแบบมีวันหมดอายุ, เปลี่ยน role, อัปโหลดปก template, ลบคอมเมนต์, แท็บ Workflow หลายแท็บ รายการนี้อยู่ในตารางเทียบด้วย (ทิศ "ของจริง → mockup")
6. **เปลี่ยน schema ด้วยวิธี ALTER เดิมใน `main.py`** และสำรองฐานข้อมูลก่อนทุกครั้ง ยังไม่เพิ่ม Alembic
7. **สิทธิ์ Official template ตามบทบาท** (ผู้ใช้กำหนด 14 พ.ย. ให้ทำหลัง refactor):

   | บทบาท | สร้าง / ตั้งเป็น Official | แก้ไข / ลบ Official | เปิด/ปิดความคิดเห็น |
   |---|---|---|---|
   | Admin | ✓ | ✓ | ✓ |
   | ผู้สอน (`can_teach`) | ✓ | ✓ | ✗ |
   | ผู้เรียน | ✗ | ✗ | ✗ |

   ทำเป็น T8.1 ต่อจาก T8 ตอนนี้ backend ให้ admin แก้ได้คนเดียวและห้ามแก้ workflow ของ Official (`server/routers/templates.py`)

   **การลบ** (ผู้ใช้ตัดสินใจ 17 พ.ย.): server ยังไม่มีทางลบ template จึงเพิ่ม `DELETE /api/templates/{id}` ใน T8.1 เป็น soft delete ด้วยคอลัมน์ `templates.deleted_at` เจ้าของ template ทั่วไป (Private/Public) ลบของตัวเองได้ แถวที่ลบไม่แสดงในทุกรายการ seed ต้องไม่สร้าง Official ที่ถูกลบกลับมา และบันทึก audit log ทุกการลบ หน้า Templates (T12) มีปุ่มลบตามสิทธิ์ (แถว C-14)

   **กรณีขอบที่ชุด B เลือกแบบปลอดภัยกว่า** (ผู้ใช้รับทั้ง 5 ข้อ 17 พ.ย.):
   1. ตั้ง template ที่มีอยู่แล้วเป็น Official ได้เฉพาะเจ้าของที่เป็น admin หรือผู้สอน (admin ก็ตั้งของคนอื่นไม่ได้) บันทึก log `permission.template_official_update`
   2. เปลี่ยน Official กลับเป็น template ธรรมดาไม่ได้ (422)
   3. Official เป็น public เสมอ (ส่ง private มา 422) และ workflow ของ Official ต้องมีอย่างน้อยหนึ่งโหนด (422) เพราะ seed จะเติม workflow ที่ว่างกลับเป็นของ seed
   4. admin ลบ template ทั่วไป (ไม่ใช่ Official) ของคนอื่นไม่ได้ (403) ลบได้เฉพาะเจ้าของ
   5. admin เปิด/ปิด `can_teach` ของตัวเองได้ (ต่างจาก role ที่ห้ามลดสิทธิ์ตัวเอง เพราะไม่ทำให้ล็อกตัวเองออก)

8. **กติกาการมองเห็น template คงเดิม** (ผู้ใช้ยืนยัน 17 พ.ย.): ทุกคนเห็น Official + Public + ของตัวเอง, Private ของคนอื่นไม่ปรากฏในรายการของใครเลย รวมถึง admin แต่ถ้า admin รู้ id ก็เปิดและโหลด Private ของคนอื่นได้อย่างเดียว ตามพฤติกรรมเดิมใน `_get_visible_template` (ผู้ใช้ยืนยัน 17 พ.ย.): แก้/ลบ/อัปโหลดปกไม่ได้ (403) และ**เขียนคอมเมนต์หรือเปิดปิดความคิดเห็นไม่ได้ (403, ผู้ใช้ตัดสิน 21 พ.ย. B3)**; ผู้ที่มองไม่เห็นแถวนั้นเรียก PATCH หรืออัปโหลดปกได้ 404 เหมือน GET/DELETE (B4) หน้า Templates แสดงเฉพาะ template จริงจากฐานข้อมูล รวมทุกผู้ใช้ครบ 13 แถว (ณ 17 พ.ย.) ห้ามมี template ตัวอย่างของ mockup

9. **Lab ค้าง mount ไว้ตลอด** (ผู้ใช้ตัดสินใจหลังจุดตรวจ 1, 17 พ.ย.): editor ของ `/lab` ถูก mount ครั้งแรกที่เปิด `/lab` แล้วค้างไว้ (`LabHost` ใน `src/App.tsx`) ตอนอยู่ route อื่นแค่ซ่อน (`visibility: hidden` + `inert`) และปิด hotkey งานที่รันอยู่รันต่อ กลับมาแล้วดูผลหรือกดหยุดได้ การแก้ undo/redo, Log panel และ clipboard ไม่หาย กลับมาที่ `/lab` แล้ว fit view ใหม่ ถ้าวิธีนี้ติดปัญหาจริงให้รายงานก่อนแล้วค่อยกลับไปใช้วิธีบันทึกทันทีกับยกเลิกงานตอนออก (ข้อเสนอเดิมของ code-reviewer) ผู้ที่ login แล้วเปิด `/` ไป `/lab` ชั่วคราวจนกว่า T17 ทำ Dashboard

## ลำดับการพึ่งพา

```
T1 สำรอง + snapshot ──┐
T2 ตารางเทียบ + ภาพ mockup ──┤
T3 เส้นฐาน lint/test ──┘
        │
T4 Router + /lab ── T5 CSS + ui primitives ── T6 Header ── T7 หน้าแรก/Login
        │
        ├── T8 can_teach ── T8.1 สิทธิ์ Official ── T9 Users
        ├── T10 Logs API ── T11 Platform Logs
        ├── T12 Templates ── T13 Template ↔ Lab ── T14 Library ใน Lab
        └── T15 /api/me ── T16 Profile ── T17 Dashboard
                                              │
                              T18 learningApi ── T19 หน้าคอร์ส ── T20 หน้างาน/ประกาศ/แจ้งเตือน
                                              │
              T21 ตรวจข้อมูล ── T22 รายงานภาพ ── T23 ความสามารถเดิม ── T24 จอเล็ก/ธีม ── T25 ปิดงาน
```

หลังจุดตรวจที่ 1 กลุ่ม T8–T9, T10–T11, T12–T14 และ T15–T17 แตะไฟล์คนละชุดเป็นส่วนใหญ่ แต่ใช้ `main.py`, `schemas.py` และไฟล์ route ของ frontend ร่วมกัน จึงตัดสินใจ (17 พ.ย.) ให้ทำต่อกันเป็นลำดับ ไม่ทำขนาน ดูหัวข้อ "วิธีสั่งงาน subagent"

## รายการ task

### ระยะ 0: เส้นฐานและความปลอดภัย
- T1 สำรองฐานข้อมูลและเก็บ snapshot ข้อมูล
- T2 สร้างตารางเทียบ (parity matrix) และถ่ายภาพ mockup ทุกหน้า
- T3 แก้ lint 3 errors และสร้างสคริปต์ตรวจ `scripts/check.sh`

### จุดตรวจ 0
มีไฟล์สำรอง, snapshot, ตารางเทียบ และภาพ mockup ครบก่อนแตะโค้ดแอป

### ระยะ 1: โครงหน้า
- T4 เพิ่ม router และย้าย editor เดิมไปที่ `/lab`
- T5 ย้าย CSS และ component พื้นฐานของ mockup
- T6 Header: เมนูตามสิทธิ์จริง ธีม เมนูบัญชี กระดิ่ง
- T7 หน้าแรกผู้เยี่ยมชมและหน้า Login

### จุดตรวจ 1
Login ด้วย Google แล้วเห็นเมนูตามสิทธิ์ และ `/lab` ทำงานเท่าเดิมทุกอย่าง **ให้ผู้ใช้ดูก่อนไประยะ 2**

### ระยะ 2: หน้าที่ใช้ข้อมูลจริง
- T8 เพิ่ม `users.can_teach` ทั้ง backend และ API
- T8.1 สิทธิ์ Official template ตามบทบาท (การตัดสินใจข้อ 7)
- T9 หน้า Users ด้วยผู้ใช้จริง
- T10 Audit log API: แบ่งหน้า ตัวกรอง และยอดรวม
- T11 หน้า Platform Logs ด้วย log จริง
- T12 หน้า Templates ด้วย template และคอมเมนต์จริง
- T13 เปิด template ใน Lab และบันทึก template จาก Lab
- T14 คลังโหนดใน Lab ตามแบบ mockup ด้วยโหนดจริงที่เปิดใช้ 22 ชนิด
- T15 Endpoint ข้อมูลของผู้ใช้เอง (`/api/me/activity`, `/api/me/summary`)
- T16 หน้า Profile
- T17 Dashboard 3 แบบ (ผู้เรียน ผู้สอน ผู้ดูแล)

### จุดตรวจ 2
ทุกตัวเลขบนหน้าจอตรงกับฐานข้อมูล (รัน T21 รอบแรก) **ให้ผู้ใช้ดูก่อนไประยะ 3**

### ระยะ 3: ส่วนที่ปล่อยว่าง
- T18 `learningApi.ts` ที่คืนรายการว่าง
- T19 หน้า Courses, Course, Lesson, Teach แบบว่าง
- T20 หน้า Submissions, Grades, Announcements และกระดิ่งแบบว่าง

### จุดตรวจ 3
ทุก route เปิดได้ ไม่มีหน้าขาวหรือ error ใน console และไม่มีข้อมูลตัวอย่างของ mockup หลุดเข้ามา

### ระยะ 4: ยืนยันความครบถ้วน
- T21 สคริปต์ตรวจข้อมูล (ฐานข้อมูล ↔ API ↔ หน้าจอ)
- T22 รายงานภาพเทียบ mockup กับของจริง
- T23 ตรวจความสามารถเดิมของ editor และระบบ admin
- T24 ตรวจจอ 375px ธีมมืด และการใช้คีย์บอร์ด
- T25 ปิดตารางเทียบและสรุปผล

### จุดตรวจสุดท้าย
ตารางเทียบไม่มีแถวสถานะ "ยังไม่ทำ", รายงานข้อมูลผ่านทุกข้อ, ผู้ใช้เปิดรายงานภาพแล้วอนุมัติ

## Skill และ agent ที่ใช้

เลือกเมื่อ 16 พ.ย. 2569 ชื่อ skill ราย T อยู่ในบรรทัด `skill:` ของแต่ละ task ใน [todo.md](todo.md)

**ใช้ทุก task**

| เมื่อไหร่ | skill |
|---|---|
| ทำ T แต่ละข้อ | `incremental-implementation` |
| ทุก commit | `git-workflow-and-versioning` |
| เทสต์ล้ม หรือผลไม่ตรงที่คาด | `debugging-and-error-recovery` |

**แยกตามชนิดงาน**

| งาน | skill | task |
|---|---|---|
| สำรองและเปลี่ยน schema บนข้อมูลจริง | `deprecation-and-migration` | T1, T8 |
| API และ type ที่เป็นสัญญาระหว่าง frontend กับ backend | `api-and-interface-design` | T8, T10, T15, T18 |
| เขียนเทสต์ก่อนแก้ logic | `test-driven-development` | T8, T8.1, T10, T12, T13, T15, T21 |
| สิทธิ์ การยืนยันตัวตน และการกันข้อมูลข้ามผู้ใช้ | `security-and-hardening` | T7 (open redirect หลัง login), T8.1, T15 |
| ตั้งข้อสงสัยกับกรณีขอบของตารางสิทธิ์ | `doubt-driven-development` | T8.1 |
| หน้าจอและ component | `frontend-ui-engineering` | T4–T7, T9, T11–T14, T16, T17, T19, T20 |
| ติดตั้ง router ให้ตรงเวอร์ชันและโหมด | `react-router` (ภายนอก) + `source-driven-development` | T4 |
| สคริปต์ Playwright ถ่ายภาพและเก็บ session | `webapp-testing` | T2, T22 |
| ตรวจในเบราว์เซอร์ (console, network, DOM) | `anthropic-skills:built-in-browser` | T23, T24 และการตรวจ LAB ทุก task |
| ตรวจ UI โหมด audit อย่างเดียว | `impeccable` | T24 |
| บันทึกการตัดสินใจและงานรอบถัดไป | `documentation-and-adrs` | T25 |

**agent ที่จุดตรวจ**

| จุดตรวจ | agent |
|---|---|
| 0 | ไม่ใช้ รันเทสต์ตามเส้นฐาน |
| 1 | `agent-skills:code-reviewer` เน้นว่า `/lab` ไม่พัง |
| 2 | `agent-skills:code-reviewer`, `agent-skills:test-engineer`, `agent-skills:security-auditor` (ขอบเขต T8, T8.1, T15) |
| 3 | `agent-skills:code-reviewer` |
| สุดท้าย | ทั้ง 3 agent อีกรอบ + `/code-review` กับ diff ทั้ง branch ก่อนขอ merge |

**ข้อตกลงการใช้**

- `browser-testing-with-devtools` ต้องใช้ Chrome DevTools MCP ซึ่งยังไม่ได้ตั้งค่า ใช้วิธีคิดของ skill นี้กับ browser ในแอปแทน ไม่ติดตั้ง MCP เพิ่ม
- ไม่ใช้ skill ด้านออกแบบ (`frontend-design`, `ui-ux-pro-max`, `interface-design`, `theme-factory`) เพราะเป้าหมายคือให้ตรง mockup ถ้าออกแบบใหม่ ภาพเทียบจะไม่ตรงกัน `impeccable` ใช้เฉพาะโหมด audit ใน T24
- ไม่ใช้ `code-simplification` และ `/simplify` เพราะขัดกับข้อห้ามจากการ refactor ที่ห้ามลบโหนด template หรือความสามารถใด

**skill ภายนอกที่ตรวจแล้ว** (ดูยอดติดตั้งบน skills.sh, ดาวและความเคลื่อนไหวของ repo บน GitHub และอ่าน SKILL.md หาคำสั่งดาวน์โหลดหรือรันสคริปต์)

| skill | ติดตั้ง | ดาว repo | ผล |
|---|---|---|---|
| `remix-run/react-router@react-router` | 2.5K | 56.6K | **ใช้** ใน T4 มีแต่คำแนะนำกับลิงก์เอกสาร ไม่มีสคริปต์ |
| `microsoft/playwright-cli` | 218K | 15.2K | ผ่าน แต่ไม่ใช้ เพราะ `webapp-testing` ทำได้เหมือนกัน และไม่ต้องติดตั้ง `npm -g` |
| `fastapi/fastapi@fastapi` | 15.6K | 104.8K | ไม่ใช้ แนะนำ `fastapi` CLI, uv, SQLModel และ `Annotated` ซึ่งต่างจากสไตล์โปรเจกต์ |
| `wshobson/agents@database-migration` | 18.2K | 42.6K | ไม่ใช้ เน้นเครื่องมือ migration แต่แผนนี้ใช้ ALTER |
| `currents-dev/playwright-best-practices` | 107K | 433 | ไม่ใช้ สำหรับชุดเทสต์ e2e ไม่ใช่สคริปต์ถ่ายภาพ |
| `liarjsdev/liarjs-skills@playwright-stealth-verify` | 126K | 5 | **ปฏิเสธ** ยอดติดตั้งไม่สมกับดาว และเป็นการหลบระบบตรวจจับ bot |
| `remix-run/agent-skills` | 0.7–3.7K | 134 | **ปฏิเสธ** repo ถูก archive แล้ว |
| skill ด้าน visual regression | 23–741 | ผู้เขียนไม่เป็นที่รู้จัก | **ปฏิเสธ** ยอดต่ำ |
| `wispbit-ai/skills@sqlalchemy-…` | 2.1K | 9 | **ปฏิเสธ** |

**สิ่งที่ติดตั้งแล้ว**

- `react-router` skill (16 พ.ย.) ที่ `~/.agents/skills/react-router` มี symlink จาก `~/.claude/skills/` เนื้อหาตรงกับฉบับที่ตรวจ ใช้ใน T4
- Playwright 1.65.2 ใน `.venv` พร้อม Chromium 159 (`chromium-1255`) (17 พ.ย.) ทดสอบเปิด headless ได้แล้ว ใช้ใน T2, T22 ไม่ได้เพิ่มลง `requirements.txt` เพราะเป็นเครื่องมือตรวจ ไม่ใช่ของที่แอปใช้ตอนรัน

## วิธีสั่งงาน subagent

ตัดสินใจ 17 พ.ย. 2569: ผู้ใช้สั่งงานกับ Opus ตัวหลักตัวเดียว Opus ตัวหลักเป็นคนคุมงาน ส่งงานให้ subagent ตามบรรทัด `ผู้ทำ:` ใน [todo.md](todo.md) และตรวจผลเองทุกครั้งก่อนไป task ถัดไป

**บทบาท**

| ใคร | effort | ทำอะไร |
|---|---|---|
| Opus ตัวหลัก | high (ผู้ใช้ตั้งใน session) | T1, T3, T4, T23–T25, เขียน prompt ส่งต่อ, ตรวจรับทุกชุด, จุดตรวจ, คุยกับผู้ใช้, ตรวจในเบราว์เซอร์ที่ต้อง login |
| Opus subagent | high | ชุด B (T8, T8.1) และชุด H (T21) งานที่ถ้าผิดจะไม่แสดงอาการ เช่นสิทธิ์รั่วแต่เทสต์ผ่าน หรือสคริปต์ตอบ PASS ทั้งที่ข้อมูลหาย |
| Sonnet subagent | medium | ชุด A, C, D, E, F, G, I1, I2 งานย้ายหน้าตามแบบ mockup ต่อกับ API ที่มีอยู่ เกณฑ์รับชัด ตรวจผลง่าย |

**ชุดงานและลำดับ** (ทำต่อกันเป็นลำดับ ไม่ทำขนาน)

| ลำดับ | ชุด | task | ผู้ทำ |
|---|---|---|---|
| 1 | — | T1, T3 | Opus ตัวหลัก |
| 2 | I1 | T2 | Sonnet |
| — | จุดตรวจ 0 | | Opus ตัวหลัก |
| 3 | — | T4 | Opus ตัวหลัก |
| 4 | A | T5 → T6 → T7 | Sonnet |
| — | จุดตรวจ 1 (หยุดให้ผู้ใช้ดู) | | Opus ตัวหลัก |
| 5 | B | T8 → T8.1 | Opus subagent |
| 6 | F | T9 | Sonnet |
| 7 | C | T10 → T11 | Sonnet |
| 8 | D | T12 → T13 → T14 | Sonnet |
| 9 | E | T15 → T16 → T17 | Sonnet |
| — | จุดตรวจ 2 (หยุดให้ผู้ใช้ดู) | | Opus ตัวหลัก |
| 10 | G | T18 → T19 → T20 | Sonnet |
| — | จุดตรวจ 3 | | Opus ตัวหลัก |
| 11 | H | T21 | Opus subagent |
| 12 | I2 | T22 | Sonnet |
| 13 | — | T23 → T24 → T25 | Opus ตัวหลัก |
| — | จุดตรวจสุดท้าย (ผู้ใช้อนุมัติ) | | Opus ตัวหลัก |

ถ้าภายหลังต้องการเร่ง ชุด G และ I1 ไม่แตะไฟล์ร่วมกับชุดอื่น จึงแยกไปทำขนานได้โดยใช้ worktree แยก ชุดอื่นให้ทำต่อกันเป็นลำดับ

**ขั้นตอนต่อหนึ่งชุด**

1. Opus ตัวหลักเขียน prompt จาก task ในชุด: เกณฑ์รับ, ไฟล์ที่แตะ, skill, ผลของ task ก่อนหน้าที่ชุดนี้ต้องรู้ และข้อห้าม (ด้านล่าง)
2. ส่งให้ subagent ตามโมเดลและ effort ที่กำหนด
3. subagent ทำทีละ task ในชุด, commit แยกทีละ task, รัน `scripts/check.sh` ก่อนรายงาน และรายงานกลับ: commit ของแต่ละ task, ผล check, สิ่งที่ทำไม่ได้หรือไม่แน่ใจ
4. Opus ตัวหลักตรวจรับ: รัน `scripts/check.sh` เอง, อ่าน diff, เช็กเกณฑ์รับทีละข้อ, ตรวจในเบราว์เซอร์เมื่อ task มีหน้าจอ ถ้าไม่ผ่านส่งกลับให้ subagent ตัวเดิมแก้
5. ผ่านแล้วติ๊กเกณฑ์รับและ task ใน `todo.md` อัปเดตสถานะใน `tasks/parity.md` แล้วไปชุดถัดไป

T7 และ T12 ให้ตัวหลักตรวจ diff ทันทีหลังจบ task นั้น ไม่รอจบชุด

**ข้อห้ามที่ต้องใส่ใน prompt ทุกครั้ง**

- ห้ามลบโหนด template หรือความสามารถใด แม้จะซ่อนหรือใช้ไม่ได้อยู่ รวมถึงบล็อกที่ปิดด้วยค่าคงที่ใน `sidebar.tsx`
- ห้ามเก็บกวาดคอมเมนต์หรือเทสต์ที่ไม่เกี่ยวกับ task
- ห้ามแก้ไฟล์นอกรายการ `ไฟล์:` ของ task โดยไม่บอกในรายงาน
- ห้ามแตะฐานข้อมูลจริงด้วยการเปลี่ยน schema ก่อนมีไฟล์สำรองจาก T1 และทดสอบกับ SQLite ก่อน
- ห้าม push และห้าม merge
- ถ้าต้องตัดสินใจเรื่องที่ไม่มีในแผน ให้หยุดและรายงาน ไม่ต้องเดาเอง

**ข้อจำกัดของ subagent**

- คุยกับผู้ใช้ไม่ได้ คำถามทั้งหมดผ่าน Opus ตัวหลัก
- login Google แทนไม่ได้ งานที่ต้องเข้าระบบจริง (ตรวจเมนูตามสิทธิ์ใน T6–T7, ถ่ายภาพของจริงใน T22) ให้ตัวหลักตรวจเอง หรือเตรียม session ที่ผู้ใช้ login ไว้ให้
- เริ่มจากศูนย์ทุกครั้ง prompt ต้องมีบริบทครบ สถานะหลักของงานอยู่ใน `todo.md` ซึ่งติ๊กทีละข้อ จึงทำต่อได้แม้บริบทของตัวหลักถูกสรุป

## วิธีเปรียบเทียบ mockup กับของจริง

ใช้หลักฐาน 3 ชั้น รวมไว้ที่ `outputs/parity-report/index.html` เปิดดูในเบราว์เซอร์ได้

**ชั้น 1: ตารางเทียบ (`tasks/parity.md`)** หนึ่งแถวต่อหนึ่งหน้า ส่วนประกอบ หรือความสามารถของ mockup (ประมาณ 22 หน้า + ส่วนร่วมเช่น header, modal, toast) แต่ละแถวมี: รหัส, ตำแหน่งใน mockup, route/ไฟล์ในของจริง, แหล่งข้อมูล, สถานะ สถานะมี 4 ค่า: `ย้ายแล้ว`, `ว่างตามแผน`, `ตัดออก` (ต้องมีเหตุผล), `ยังไม่ทำ` และมีส่วนที่สองสำหรับความสามารถเดิมของของจริงที่ต้องไม่หาย

**ชั้น 2: ตรวจข้อมูล (`scripts/verify_migration.py`)** ตรวจ 3 เรื่อง
1. ฐานข้อมูลหลังย้ายเทียบกับ snapshot จาก T1: แถวเดิมทุกแถวยังอยู่และค่าไม่เปลี่ยน (เทียบ hash รายแถว ไม่นับคอลัมน์ที่เปลี่ยนตามการใช้งาน เช่น `last_login_at`, `updated_at`)
2. API เทียบกับฐานข้อมูล: จำนวนและชุด id ที่ endpoint ของแต่ละหน้าคืนมา ต้องเท่ากับที่ query ตรงจากฐานข้อมูล (ผู้ใช้, template แยก official/public/ของฉัน, คอมเมนต์, log รวมทุกหน้า)
3. โหนดและ template: โหนดที่เปิดใช้ทั้ง 22 ชนิดใน `nodeCatalog.ts` ปรากฏในคลังของ Lab ครบ และรายการที่เปิดใช้ 9 รายการใน `server/official_templates.json` ตรงกับแถว Official ในฐานข้อมูล โดยทุกแถวมี workflow

**ชั้น 3: ภาพเทียบ (`scripts/parity_screenshots.py`)** ถ่ายทุกแถวในตารางเทียบจาก mockup (พอร์ต 8765) และของจริง (พอร์ต 5173) ที่ 1440×900 และ 375×812 วางคู่กันในรายงาน (เขียนเป็น Python รันด้วย `./.venv/bin/python` เพราะ Playwright ที่ติดตั้งอยู่ใน `.venv` ผู้ใช้เลือก 17 พ.ย. แทนการติดตั้ง Playwright ฝั่ง Node) พร้อมสถานะและหมายเหตุของแถวนั้น หน้าที่ว่างตามแผนจะเห็น mockup ที่มีข้อมูลตัวอย่างคู่กับของจริงที่ว่าง และมีป้ายบอกว่าเป็นไปตามแผน

## ความเสี่ยง

| ความเสี่ยง | ผลกระทบ | วิธีรับมือ |
|---|---|---|
| CSS ของ mockup ชนกับ Tailwind และ `index.css` | สูง: หน้า Lab เพี้ยน | ครอบ scope `.viper-platform`, ไม่ใส่ scope นี้ที่ `/lab`, ตรวจ Lab ทุกครั้งที่จบ task ในระยะ 1 |
| ย้าย `App.tsx` ไปเป็น route แล้ว state ของแท็บหรือ hotkey พัง | สูง | T4 ทำเป็น task แรกของระยะ 1 และมีรายการตรวจความสามารถเดิม (T23) ที่รันซ้ำได้ |
| ของจริงมีแค่ Google login สคริปต์ถ่ายภาพเข้าระบบเองไม่ได้ | กลาง: รายงานภาพทำอัตโนมัติไม่ครบ | ผู้ใช้ login เองหนึ่งครั้งในเบราว์เซอร์ของสคริปต์แล้วบันทึก session ไว้ใช้ซ้ำ; ต้องมีบัญชี admin และบัญชีธรรมดาอย่างละหนึ่ง |
| Audit log 2,626 แถวแต่ API ให้สูงสุด 500 | กลาง: หน้า Logs แสดงไม่ครบ | T10 เพิ่มการแบ่งหน้าก่อนทำหน้า Logs |
| `results` ไม่มีเจ้าของ | ต่ำ: แสดงผลทดลองรายคนจากตารางนี้ไม่ได้ | ใช้ `audit_logs` (`processing.run`) แทนในรอบนี้ |
| เพิ่มคอลัมน์ด้วย ALTER แล้วผิดพลาด | กลาง | สำรองใน T1 และทดสอบกับ SQLite ในเทสต์ก่อนรันกับ PostgreSQL |
| โค้ด mockup เขียนบรรทัดยาวมาก (`App.jsx` 406 บรรทัดแต่ละบรรทัดยาวหลายพันตัวอักษร) | กลาง: ย้ายแล้วตกหล่น | ย้ายทีละ component ตามแถวในตารางเทียบ และติ๊กสถานะทีละแถว |
| เทสต์ SURF ล้ม 15 รายการอยู่ก่อนแล้ว | ต่ำ | ไม่แก้ในแผนนี้ ใช้เป็นเส้นฐาน: จำนวนที่ล้มต้องไม่เพิ่ม |
| backend ที่รันด้วย `--reload` ใช้โค้ดที่กำลังแก้กับฐานข้อมูลจริงทันที | กลาง: การเปลี่ยน schema หรือ seed ไปถึงข้อมูลจริงก่อนสำรอง | สำรองตาม T1 ก่อนเปิด backend กับโค้ดที่แก้ schema และทดสอบกับ SQLite ก่อน |
| `outputs/` และ `docs/` ถูก git ignore | ต่ำ: รายงานและ source ของ mockup ไม่เข้า repo | เก็บ `tasks/` (ไม่ถูก ignore) เป็นที่บันทึกหลัก |

## คำถามที่ต้องการคำตอบ

แผนเดินต่อได้ด้วยค่าเริ่มต้นที่ระบุ ถ้าต้องการต่างจากนี้ให้บอกก่อนเริ่ม task ที่เกี่ยวข้อง

1. **หน้าคอร์ส**: ค่าเริ่มต้นคือแสดงหน้าว่างและยังไม่เปิดปุ่มสร้างคอร์ส (ไม่มีตาราง) ทางเลือกคือสร้างตารางและให้ผู้สอนสร้างคอร์สเปล่าได้เลย ซึ่งเพิ่มงาน backend ประมาณ 2–3 task (กระทบ T18–T19)
2. **ข้อมูลโปรไฟล์ที่ของจริงไม่มี** (ภาควิชา รหัสนักศึกษา แนะนำตัว): ค่าเริ่มต้นคือไม่แสดง ทางเลือกคือเพิ่มคอลัมน์ว่างให้ผู้ใช้กรอกเอง (กระทบ T16)
3. **ผู้เยี่ยมชมที่ยังไม่ login**: ~~ตอบแล้ว (17 พ.ย.) ใช้ค่าเริ่มต้น เห็นหน้าแรกอย่างเดียว~~ **ผู้ใช้สั่งเปลี่ยน (23 พ.ย. 2569): ผู้เยี่ยมชมเปิดดู `/courses`, `/courses/:courseId` และ `/templates` ได้ (Official และ Public, รายละเอียด template ผ่าน `GET /api/templates/{id}` ; Private ได้ 404 เหมือนผู้ที่ไม่ใช่เจ้าของ ; `/mine`, ความคิดเห็น และการเขียนทุกชนิดยังต้อง login) แต่เข้า Lab ไม่ได้ ปุ่ม "เปิดใน Lab"/"ดูคอร์ส"/"ลงทะเบียน" พาไป `/login?next=...` ; เมนูผู้เยี่ยมชม Dashboard, Courses, Templates, Lab (Lab ไปหน้า login) ; ไม่แก้ schema** ส่วนเดิมที่ยังใช้: ทุก route อื่นรวม `/profile` พาไป Login (ไม่ย้ายการ์ด GuestProfile, แถว P-29 เป็น `ตัดออก`) (กระทบ T7, T12)
4. **Official Template**: ตอบแล้ว ใช้ตารางสิทธิ์ในการตัดสินใจข้อ 7 (ผู้สอนสร้าง แก้ และลบได้ แต่เปิดปิดความคิดเห็นไม่ได้) ทำใน T8.1 พร้อม soft delete (ตอบเพิ่ม 17 พ.ย.)
5. **บัญชีสำหรับตรวจ**: ต้องใช้บัญชี Google ที่เป็น admin 1 บัญชี และบัญชีธรรมดา 1 บัญชี สำหรับ T22–T24

## งานรอบถัดไป (สรุปตอนปิดแผน T25, 23 พ.ย. 2569)

รวมทุกเรื่องที่ไม่ทำในแผนนี้ไว้ที่เดียว เรียงตามความสำคัญในแต่ละหมวด แหล่งที่มาอยู่ในวงเล็บ

### 1. ระบบที่ปล่อยว่างตามแผน (ระยะ 3)
- **ระบบคอร์ส**: ตาราง/API ของคอร์ส บทเรียน การลงทะเบียน แล้วต่อเข้า `src/lib/learningApi.ts` (ตอนนี้คืน `[]`/`null` ทุกฟังก์ชัน) เปิดปุ่มลงทะเบียน สร้างคอร์ส จัดการคอร์ส ที่ปิดไว้ด้วย title "ระบบคอร์สจะเพิ่มภายหลัง" (T19, T20; แถวที่เป้าหมายเป็น `ว่างตามแผน` ใน `tasks/parity.md`: P-05..P-09, P-11, P-12, P-14..P-21, C-04, C-05, C-17..C-19)
- **ตัวออกแบบ Lab ของบทเรียน** (`design` ของ mockup, แถว P-12) และปุ่ม "เปิด Lab ของบทนี้" ใน Lesson
- **บทเรียนทดสอบ / งานที่ส่ง / คะแนน**: หน้า Submissions และ rubric แสดงสถานะว่าง ต้องมีตาราง submission และ API ส่งงาน ให้คะแนน (T20)
- **การแจ้งเตือนและประกาศ**: กระดิ่งอ่านจาก `listNotifications()` ที่ว่าง และสถานะ "อ่านแล้ว" เก็บเฉพาะในหน้า (`readIds` ใน `Header.tsx`) ต้องมีตารางและ API บันทึกสถานะอ่าน (T20)

### 2. ข้อบกพร่องที่มีก่อนแผน (พบระหว่างตรวจ ไม่ได้แก้)
- **R-41 ผลของโหนดหายหลัง refresh**: `handleFlowChange` ใน `src/pages/LabPage.tsx` เปลี่ยน `success` เป็น `idle` เมื่อไม่ได้รัน pipeline แล้วตอนบันทึก `n2n_app_tabs` เก็บ payload เฉพาะโหนด `success` ผลจึงหายหลัง reload (โค้ดเหมือน `e8aae3cf`) ; ต้องตัดสินว่าจะเก็บ payload ย่อของทุกโหนดที่มีผล หรือแยกสถานะที่แสดงกับสถานะที่บันทึก
- **Stop ไม่ยกเลิกโหนดที่กำลังรัน** (R-11): Stop หยุดก่อนโหนดถัดไปเท่านั้น งานเทรน YOLO ที่รันอยู่ต้องกด Cancel ของโหนดเอง ; ควรให้ Stop เรียก cancel ของโหนดที่รันอยู่ด้วย
- **SURF ล้ม** เพราะ OpenCV ที่ติดตั้งไม่มี nonfree (15 เทสต์ในเส้นฐาน) ; ติดตั้ง build ที่มี nonfree หรือซ่อนโหนด SURF
- ประวัติ Undo รวมสแนปช็อตสถานะตอนรันด้วย (R-03) ทำให้ต้องกด Undo หลายครั้ง

### 3. ความปลอดภัย (ข้อ Low จาก security-auditor จุดตรวจ 2 และที่ผู้ใช้สั่งจด)
- ระบุ `weights_only=True` ให้ `torch.load` ทั้ง 6 จุด: `server/algos/restoration/dncnn.py:56`, `restoration/SwinIR.py:94`, `segmentation/DeepLabv3.py:41`, `segmentation/UNET.py:92`, `segmentation/MaskRNN.py:50`, `enchancement/Zero.py:83` (ตอนนี้ปลอดภัยเพราะ torch 2.13 ใช้ค่านี้เป็นค่าเริ่มต้น แต่ควรระบุเอง; ผู้ใช้สั่งจด 21 พ.ย. หลัง C2 รับ .pt/.pth)
- ตั้ง `https_only=True` ให้ session cookie เมื่อ deploy ผ่าน HTTPS (`server/main.py`)
- ตรวจ header `Origin` / `Sec-Fetch-Site` กับทุก method ที่ไม่ใช่ GET หรือใช้ CSRF token แบบ double-submit (ตอนนี้พึ่ง SameSite=Lax อย่างเดียว)
- จำกัดจำนวนและความยาวค่า `action` ใน `/api/me/activity` และ `/api/admin/audit-logs` (เช่นไม่เกิน 50 ค่า)
- ให้ startup ล้มเมื่อใช้ `SESSION_SECRET` ค่า default นอก dev (`server/config.py`)
- ย้าย seed ออกจาก `GET /api/templates/official` ไปทำตอน startup อย่างเดียว หรือใช้ `INSERT ... ON CONFLICT DO NOTHING` และ commit เฉพาะเมื่อมีการเปลี่ยน
- ไฟล์ปกของ template ที่ถูกลบหรือเป็น Private ยังเปิดได้ผ่าน `/static` โดยไม่ต้อง login (เสิร์ฟผ่าน endpoint ที่ตรวจสิทธิ์ หรือย้าย/เปลี่ยนชื่อไฟล์ตอนลบ)

### 4. การเข้าถึงและหน้าจอ (จาก T24)
- **contrast ของ editor ใน `/lab`** ธีมมืด: ปุ่ม Start (3.30:1), ▶ Run (3.30–3.56:1), Choose Image (3.74:1) และชื่อโหนดบางชนิด (2.61:1) ต่ำกว่า WCAG AA 4.5:1 (สีจาก Tailwind ของ editor เดิม)
- **contrast ของแผง Admin Control Center เดิม** (`src/components/AdminUserPanel.tsx`, เปิดจาก "จัดการผู้ใช้ (แผงเดิม)"): หัวตาราง 3.75:1, อีเมลและวันหมดแบน 3.29:1, แท็บ ACTIVITY LOGS 4.02:1
- แถบเมนูหลักที่ 375px เลื่อนแนวนอนในกล่องของตัวเองโดยไม่มีสัญญาณว่าเลื่อนได้ (เมนูท้าย ๆ เช่น Users, Platform Logs, Lab มองไม่เห็นตอนแรก)
- `App.css` ที่สร้างจาก mockup ยังมีสีตายตัวหลายจุด ควรค่อย ๆ ย้ายเป็น token (T24 ทับไปแล้วเฉพาะ `.brand-small`)

### 5. อื่น ๆ
- ปุ่ม `UserMenu` เดิมของ Lab (`src/components/UserMenu.tsx`) ไม่ถูก render ตั้งแต่ T14 (คงไฟล์ไว้ตามข้อห้ามลบ) ตัดสินว่าจะใช้ต่อหรือเลิกอย่างเป็นทางการ

### 6. จากจุดตรวจสุดท้าย (23 พ.ย. 2569, ผู้ใช้สั่งย้ายมา ไม่แก้ในแผนนี้; รายละเอียดเต็มอยู่ใน `tasks/todo.md` หัวข้อ "ผลรีวิวจุดตรวจสุดท้าย")
- **F4** ปก template ไม่จำกัดจำนวนพิกเซล (`save_reencoded_cover`): PNG 140 KB ขนาด 12000×12000 ใช้ RAM ~335 MB ต่อคำขอ ; ตรวจ `image.size` ก่อน `load()` (เช่นไม่เกิน 25 ล้านพิกเซล) ตอบ 422
- **F7** เทสต์: เลื่อน template ที่ workflow ว่างเป็น Official ต้องได้ 422
- **F8** เทสต์ re-encode ปก: EXIF orientation, MPO, CMYK ; และ MPO ใน `/api/upload`
- **F9** unit test ฝั่ง frontend: `templateAccess.ts` (รวม `canDeleteTemplate` ใหม่), `permissions.ts`, ส่วน sessionStorage ของ `safeNext.ts`, `theme.ts`, `labBridge.ts`, `learningApi.ts`
- **F10** สคริปต์ UI: เช็ก A2 ใน `ui_checks.py` ผ่านได้แม้ไม่มี guard (`time.sleep` ใน route handler) ; `ui_checks_phase3.py` exit 0 เสมอ ; จะเพิ่มทั้งสองเข้า `check.sh` หรือไม่
- **F11** เทสต์ guard read-only ของ `verify_migration.py` ฝั่ง PostgreSQL และ branch RuntimeError ; ตัวกรอง JSON ของ `counted_run_conditions` บน PostgreSQL
- **F12** Lab tabs (`n2n_app_tabs`) ใช้ร่วมกันทุกบัญชีในเบราว์เซอร์เดียว (มีก่อนแผน) ; key ต่อ user id หรือล้างตอน logout
- **F14** workflow ที่โหลดจาก template ไม่ถูก sanitize ตอนโหลด (`style`/`className`, URL รูปภายนอก)
- **F15** logout ไม่ยกเลิก session ฝั่ง server (cookie ที่หลุดใช้ได้ถึง 8 ชม.) ; `session_version` ใน users ถ้าต้องการ
- **F17** เทสต์ย่อยของ audit log (`q` กับ `_` และ display_name, escape ของ `action_prefix`, `expose_headers`), การลบชนกัน, `pytest.raises(Exception)` กว้างไป
- **F18** ไม่มี CSP / frame-ancestors ; `resolve_image_path` รับ absolute path ใดก็ได้ (อ่านไฟล์ภาพที่ไหนก็ได้บนเครื่อง)
- **F19** admin แก้ `can_teach` ของตัวเองแล้ว AuthContext ไม่ refresh
- **F20** หลังเปิด /lab หน้าอื่นมี Header 2 ชุด (ซ่อน 1)
- **F21** skip link บน /lab ไม่มีปลายทาง `id="main"`
- **F22** PATCH template สำเร็จแต่อัปโหลดปกล้ม การ์ดยังแสดงชื่อเดิม
- **F23** `hasPendingNext()` ไม่มีผู้เรียก (ห้ามลบตามข้อห้าม จดไว้)
- **ใหม่ (พบตอนแก้ F1): Ultralytics ติดตั้งแพ็กเกจเองตอนรัน** เมื่อ import ultralytics แล้ว มันแทน `PIL.Image.open` ด้วยตัวที่ `pip install pi-heif` ลง venv ทันทีที่เปิดไฟล์ที่ไม่ใช่รูปที่รู้จัก ; การตรวจอัปโหลดและปกแก้แล้วให้ใช้ `Image.open` เดิมของ Pillow (`_pillow_open` ใน `server/utils_io.py`) และเทสต์ตั้ง `YOLO_AUTOINSTALL=false` แต่ server ยังเปิด auto-install อยู่ (เส้นทางอื่นที่เปิดรูปผ่าน Pillow หลัง import ultralytics) ; ตัดสินว่าจะตั้ง `YOLO_AUTOINSTALL=false` ให้ server หรือไม่ (ต้องติดตั้ง requirement ที่ ultralytics ต้องใช้ล่วงหน้าเอง)
- รูปเดิมจาก `Image-to-Descriptor/image` (ab4e0513) เก็บไว้ที่ `outputs/legacy-images/` (ถูก git ignore, ไม่ commit)
