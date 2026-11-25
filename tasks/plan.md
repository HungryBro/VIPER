# แผน: ระบบคอร์ส (ผู้สอนสร้างคอร์ส + ผู้เรียนลงทะเบียน)

สร้าง 25 พ.ย. 2569 · แผนเดิมย้ายไปที่ `tasks/archive/lab-layout/` (ปรับหน้า Lab) และ `tasks/archive/mockup-integration/` (นำ mockup เข้าแอปจริง T1–T25)
Branch: `course-system` แตกจาก `main@656865ff` · commit ในเครื่องได้ ห้าม push ห้าม merge จนกว่าผู้ใช้จะสั่ง
รายการงานและเกณฑ์รับ: `tasks/todo.md`

## เป้าหมาย
เปลี่ยนหน้าคอร์สที่ตอนนี้เป็นสถานะว่าง (T19 ของแผนเดิม, parity P-05..P-09, P-11, C-18, C-19) ให้ใช้ข้อมูลจริง
- **ผู้สอน:** สร้างคอร์ส (Draft) → เพิ่ม แก้ เรียง และลบบทเรียน (Markdown) → พรีวิวหน้าคอร์ส → Publish / Unpublish / Archive → ดูรายชื่อผู้ลงทะเบียน
- **ผู้เรียน:** เห็นคอร์ส Published → ลงทะเบียน → อ่านบทเรียน → ยกเลิกการลงทะเบียนได้ → Dashboard แสดงคอร์สที่ลงทะเบียน
- **admin:** เห็นและจัดการทุกคอร์ส และลบคอร์สได้ทุกสถานะเมื่อกรอกเหตุผล

**ยังไม่ทำรอบนี้ (แผนถัดไป):** ตัวออกแบบ Lab ของบทเรียน (`lab_activities`, parity P-12), ปุ่ม "เปิด Lab ของบทนี้", การส่งงาน การตรวจอัตโนมัติ Rubric และคะแนน (T20 เดิม), ประกาศ, การแจ้งเตือน, การอนุมัติคำขอลงทะเบียน, ผู้สอนเอาผู้เรียนออกจากคอร์ส, ผู้สอนร่วม และหน้ากู้คืนหรือลบถาวรสำหรับคอร์สที่ถูกลบ

## การตัดสินใจ (ผู้ใช้ตอบ 25 พ.ย. 2569)
1. **ขอบเขต B:** ทำฝั่งผู้สอนและการลงทะเบียน ส่วน Lab ส่งงาน และ Rubric ยกไปแผนหน้า (Q1)
2. **สิทธิ์จัดการคอร์ส:** admin จัดการได้ทุกคอร์ส ผู้สอนจัดการได้เฉพาะคอร์สของตัวเองขณะที่ `users.can_teach` ยังเป็น true ถอนสิทธิ์แล้วจัดการไม่ได้ทันที แต่คอร์สยังอยู่ รอบนี้ไม่มีผู้สอนร่วม (Q4)
3. **รหัสคอร์ส (`code`):** ไม่บังคับกรอก ถ้าเว้นว่าง server จะสุ่ม `VP-` ตามด้วย 6 ตัวจากชุด `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (ตัด 0/O/1/I/L) เช่น `VP-7K2Q9M` แล้วสุ่มใหม่ถ้าซ้ำ เก็บหลัง strip และแปลงเป็นตัวพิมพ์ใหญ่ เทียบแบบไม่สนตัวพิมพ์ ห้ามซ้ำเฉพาะคอร์สที่ยังไม่ถูกลบ (partial unique index `WHERE deleted_at IS NULL`) แก้รหัสได้ภายหลัง เก็บทั้ง `code` และ `title` แยกคอลัมน์ ค้นหาได้ทั้งสองแบบ (Q5, Q5a–d)
4. **สถานะคอร์ส (Q10):**
   | สถานะ | ใครเห็นใน `/courses` | ลงทะเบียนใหม่ได้ | ผู้ที่ลงทะเบียนไว้แล้ว |
   |---|---|---|---|
   | Draft | ผู้จัดการคอร์ส + ผู้ที่ลงทะเบียนไว้แล้ว (กรณี Unpublish) | ไม่ได้ | อ่านได้ |
   | Published | ทุกคน รวมผู้เยี่ยมชม | ได้ | อ่านได้ |
   | Archived | ผู้จัดการคอร์ส + ผู้ที่ลงทะเบียนไว้แล้ว | ไม่ได้ | อ่านได้อย่างเดียว |
5. **เงื่อนไข Publish:** ต้องมีอย่างน้อย 1 บทที่ `content_md.strip()` ไม่ว่าง ส่วนกติกา mockup ที่ต้องมีบทที่ Lab ครบ เก็บเป็นค่าคงที่ `PUBLISH_REQUIRES_LAB = False` ใน `server/routers/courses.py` เปิดเมื่อทำ `lab_activities` เสร็จ (Q12)
6. **การลบ:** ทั้งคอร์สและบทเรียนใช้ soft delete (`deleted_at` แบบ templates)
   - ผู้สอนลบคอร์สได้เฉพาะ Draft ที่ไม่มีผู้ลงทะเบียน active
   - admin ลบได้ทุกสถานะ แต่ต้องกรอกเหตุผล 1–500 ตัวอักษร (เก็บใน audit log) และกล่องยืนยันต้องแสดงจำนวนผู้ลงทะเบียนที่จะเสียสิทธิ์ (Q3, Q3b=A, Q3c)
7. **การลงทะเบียน:**
   - ได้สิทธิ์ทันทีไม่ต้องรออนุมัติ (Q8)
   - ยกเลิกเองได้ที่ `/courses/:id` ด้วยปุ่มรองพร้อมกล่องยืนยัน (Q9, Q9c)
   - ลงทะเบียนใหม่ได้ถ้าคอร์สยัง Published โดยใช้แถวเดิมและสลับ `status` ระหว่าง `active` กับ `cancelled` ไม่ลบแถว (Q9a)
   - ยกเลิกในคอร์ส Archived ได้ แต่ต้องเตือนว่า "คอร์สนี้ปิดรับแล้ว ยกเลิกแล้วจะกลับมาอ่านไม่ได้" (Q9b)
8. **ผู้จัดการคอร์สไม่ลงทะเบียน:** เจ้าของคอร์สและ admin ไม่เห็นปุ่มลงทะเบียนและอ่านบทได้ในฐานะผู้จัดการ ส่วนผู้สอนคนอื่นลงทะเบียนเป็นผู้เรียนได้ (Q14)
9. **รายชื่อผู้ลงทะเบียน:** `/teach/:id` แสดงชื่อ อีเมล และวันที่ลงทะเบียน (เฉพาะ active) ให้เจ้าของและ admin ดูอย่างเดียว พร้อมป้ายเล็กว่าการเอาผู้เรียนออกจะเพิ่มภายหลัง และคอมเมนต์ `TODO(course-remove-learner)` ในโค้ด (Q11, Q15)
10. **ผู้เยี่ยมชม:** เห็นรายการคอร์ส Published และหน้าคอร์สพร้อมรายชื่อบทเรียน (ชื่อและคำโปรย) ส่วน `/lessons/:id` ต้อง login ตามที่ตัดสินไว้เมื่อ 23 พ.ย. (parity P-05..P-07, Q6)
11. **Dashboard ผู้เรียน:** ส่วน "คอร์ส" บน `/` แสดงคอร์สที่ลงทะเบียน active ส่วนความคืบหน้า ไทม์ไลน์ และงานกำหนดส่งยังว่าง (Q13)
12. **ลำดับงาน:** แบ่งเป็นชิ้นที่ใช้งานได้ทีละเส้นทาง (backend → หน้าจอของเส้นนั้น) และมีจุดตรวจให้ผู้ใช้ดูทุก 2–3 งาน (Q7)

## สถาปัตยกรรม
- **ตารางใหม่ (สร้างด้วย `create_all` ใน `server/main.py:73` ไม่ต้อง ALTER):**
  - `courses`: id, owner_id → users (CASCADE), code String(20), title String(120), description Text, status (`draft|published|archived` + CheckConstraint), deleted_at, created_at, updated_at
  - `lessons`: id, course_id → courses (CASCADE), position, title String(120), subtitle String(200), content_md Text (≤20000), minutes (1–600, ค่าเริ่มต้น 20), level (`พื้นฐาน|ปานกลาง|ขั้นสูง`), color (ค่าเริ่มต้น `blue`), deleted_at, created_at, updated_at
  - `enrollments`: id, course_id, user_id, status (`active|cancelled`), created_at, updated_at, unique(course_id, user_id)
- **router ใหม่ `server/routers/courses.py`:** ใช้รูปแบบเดียวกับ `server/routers/templates.py` คือ `_template_query` (:29) กรอง deleted_at, `_get_visible_template` (:39) ตอบ 404 เมื่อมองไม่เห็น และ `_add_audit` (:76) จากนั้น `include_router` ต่อจาก templates (`main.py:125`) error detail ฝั่ง server เป็นภาษาอังกฤษ
- **frontend:** เปลี่ยนเนื้อฟังก์ชันใน `my-react-flow-app/src/lib/learningApi.ts` ตามคอมเมนต์บรรทัด 1–8 (คง signature เดิม และเพิ่ม field ได้แบบ optional เท่านั้น) error ใช้ข้อความไทย ใช้ `readJson` และ `apiFetch` แบบ `templateApi.ts:65–104`
- **หน้าจอ:** ใช้ `Modal`, `Markdown`, `Button`, `Badge` และ `Empty` จาก `platform/ui.tsx`, `useToast()` จาก `platform/toast.ts:8` และ `window.confirm` แบบ `TemplateDetail.tsx:93` หน้าตาและข้อความ port จาก mockup `outputs/viper-learning-v2/src/Teaching.jsx` (`CourseForm` :8, `LessonEditor` :25, `CourseEditor` :33)
- **audit action ใหม่:** `course.create`, `course.update`, `course.status`, `course.delete`, `lesson.create`, `lesson.update`, `lesson.delete`, `enrollment.create`, `enrollment.cancel` และเพิ่มป้ายใน `components/AdminAuditLogView.tsx:26`

## ลำดับงาน
```
T0 เตรียม
T1 BE คอร์ส ──> T2 UI สร้าง/แก้คอร์ส ──> [จุดตรวจ 1]
T3 BE บทเรียน ──> T4 UI บทเรียน ──> T5 Publish/สถานะ ──> [จุดตรวจ 2: flow ผู้สอนครบ]
T6 BE ลงทะเบียน ──> T7 UI ลงทะเบียน + อ่านบท + รายชื่อ + Dashboard ──> [จุดตรวจ 3]
T8 ลบคอร์ส (ผู้สอน/admin) ──> T9 ป้าย audit + parity + ตรวจรวม ──> [จุดตรวจสุดท้าย]
```
ทุกงานต้องทำตามลำดับ เพราะงานถัดไปใช้ตารางหรือ API ของงานก่อนหน้า และหลายงานแก้ `TeachPage.tsx` กับ `learningApi.ts` ไฟล์เดียวกัน จึงทำขนานกันไม่ได้

## ความเสี่ยง
| ความเสี่ยง | ผลกระทบ | วิธีรับมือ |
|---|---|---|
| `scripts/ui_checks_phase3.py:9` (`FAKE`) แทน `learningApi.ts` ทั้งไฟล์ ถ้าเพิ่มฟังก์ชันใหม่แต่ไม่เพิ่ม stub ใน FAKE การ import จะพังทั้งชุด | สูง | ทุกงานที่เพิ่ม export ใน learningApi ต้องเพิ่ม stub ใน FAKE ด้วย |
| partial unique index ของ `code` ต้องทำงานได้ทั้ง PostgreSQL และ SQLite (ใช้ในเทสต์) | กลาง | ใช้ `Index(..., unique=True, postgresql_where=..., sqlite_where=...)` และมีเทสต์ที่สร้างรหัสซ้ำหลังลบ |
| ฐานข้อมูลจริงมีตาราง `users` อยู่แล้ว ส่วนตารางใหม่สร้างผ่าน `create_all` | กลาง | ทดสอบในเบราว์เซอร์บนฐานชั่วคราวเท่านั้น และสำรองฐานจริงก่อน merge |
| เทสต์ backend เส้นฐานล้มอยู่ 15 ตัว (SURF ไม่มี nonfree) | ต่ำ | `scripts/check.sh` เทียบกับ `tasks/baseline/test-baseline.json` ถ้าล้มเพิ่มต้องหยุดถาม |
| เปิดเนื้อหาบทเรียนผิดคน (ผู้ไม่ได้ลงทะเบียน ผู้ที่ยกเลิกแล้ว หรือคอร์สที่ถูกลบ) | สูง | ตรวจสิทธิ์ที่ server ทุก endpoint และมีเทสต์ทั้งกรณีอนุญาตและไม่อนุญาตของแต่ละบทบาท |
| การเปลี่ยนข้อความ `COMING_LATER` อาจทำให้ selector ใน ui_checks หาไม่เจอ | ต่ำ | grep ข้อความใน `scripts/ui_checks*.py` ก่อนแก้ |

## วิธีทดสอบในเบราว์เซอร์
- ใช้ฐานข้อมูลชั่วคราวแยกจากฐานจริง (ตั้ง `DATABASE_URL` เป็นฐานใหม่) แล้ว login ด้วย session cookie ที่ลงชื่อแบบ `_session_cookie` ใน `scripts/verify_migration.py:329`
- ตรวจตัวตนด้วย `GET /api/auth/me` ก่อนทดสอบแต่ละบทบาท ห้ามใช้บัญชี IronMello (id 4)
- บัญชีทดสอบ: admin, ผู้สอน A, ผู้สอน B (ทั้งคู่ `can_teach`), ผู้เรียน และผู้เยี่ยมชม (ไม่ login)
- ทดสอบที่จอ 1440 และ 375 ทั้งธีมมืดและสว่าง วัดด้วย `getComputedStyle` และ `getBoundingClientRect` แล้วเก็บภาพใน `outputs/course-system/<งาน>__<หน้า>__<บทบาท>__<กว้าง>__<ธีม>.png`

## ข้อห้าม
- ห้ามลบโหนด template ความสามารถ หรือค่าคงที่ที่ปิดไว้ (`SHOW_LAB_TEMPLATES_TAB`, `SHOW_LEGACY_TEMPLATE_LIST`, `NODE_GROUPS` enabled, `LAB_FORCE_DARK` ฯลฯ)
- ห้ามลบคอมเมนต์หรือเทสต์ที่ไม่เกี่ยวกับงาน
- ห้าม push และห้าม merge จนกว่าผู้ใช้จะสั่ง
- ห้ามใช้บัญชี IronMello (id 4) ทดสอบ และต้องตรวจ `/api/auth/me` ก่อนทดสอบเรื่องสิทธิ์
- ห้ามทดสอบบนฐานข้อมูลจริง
- ห้ามสร้างตาราง `lab_activities`, `submissions` หรือ `reviews` ห้ามเปิดปุ่มออกแบบ Lab และห้ามเปิดปุ่ม "เปิด Lab ของบทนี้"
- ห้ามเปลี่ยน signature หรือลบ field เดิมใน `learningApi.ts` และ `platform/types.ts`
- ห้ามใส่ข้อมูลตัวอย่างของ mockup (คอร์สหรือบทเรียนตัวอย่าง) ลงในโค้ดหรือฐานข้อมูล
- ห้ามแก้ไฟล์ของ Lab (`src/pages/LabPage.tsx`, `src/FlowCanvas.tsx`, `src/index.css`)
- ของที่อาจกลับมาใช้อีก (เช่น กติกา Publish แบบเดิม) ให้ทำเป็นค่าคงที่สลับได้ ไม่ลบทิ้ง
- ถ้าเจอสิ่งที่ไม่คาดคิด ให้หยุดถามเป็นภาษาไทยก่อน ห้ามเดาแก้

## คำถามที่ยังเปิด (แผนถัดไป)
- ผู้สอนเอาผู้เรียนออกจากคอร์ส: ต้องตัดสินว่าผู้ที่ถูกเอาออกลงทะเบียนกลับได้หรือไม่ (มี marker `TODO(course-remove-learner)` ในโค้ดแล้ว)
- หน้าคอร์สที่ถูกลบสำหรับ admin (กู้คืนหรือลบถาวร)
- เมื่อเปิด `PUBLISH_REQUIRES_LAB` คอร์สที่ Publish ไปแล้วแต่ไม่มี Lab จะเป็นอย่างไร
- toast ของแพลตฟอร์ม (`platform/toast.ts`, `Notify = (message) => void`) ไม่มีชนิด error ข้อความผิดพลาดจึงขึ้นไอคอนถูกในทุกหน้า (พบที่จุดตรวจ 1) ควรแก้แยกเป็นงานของแพลตฟอร์ม ไม่ใช่ในงานคอร์ส
