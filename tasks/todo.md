# todo: ระบบคอร์ส (ผู้สอนสร้างคอร์ส + ผู้เรียนลงทะเบียน)

แผนและการตัดสินใจ: `tasks/plan.md` · branch `course-system` (จาก `main@656865ff`) · commit ในเครื่องได้ ห้าม push ห้าม merge
ตรวจทุกงาน: `scripts/check.sh` ต้องได้ `CHECK PASS` และ `npx tsc -b` ใน `my-react-flow-app` ต้องไม่มี error · สคริปต์ UI (`scripts/ui_checks.py`, `ui_checks_phase3.py`, `ui_checks_touch.py`) ต้องผ่านเท่าเดิมหรือมากกว่า
เบราว์เซอร์: ใช้ฐานชั่วคราว + `_session_cookie` (`scripts/verify_migration.py:329`) ตรวจ `/api/auth/me` ก่อนทุกบทบาท ห้ามใช้ id 4 ถ่ายภาพที่จอ 1440/375 ทั้งธีมมืดและสว่าง เก็บที่ `outputs/course-system/`
skill ที่ใช้ทุกงาน: `agent-skills:incremental-implementation`, `agent-skills:test-driven-development` (งาน BE), `agent-skills:frontend-ui-engineering` (งาน UI), `anthropic-skills:built-in-browser`
ทุกงานจบด้วย commit ภาษาไทย 1 ก้อน และเขียน "ผลตรวจ" ใต้งานนั้น

### [x] T0 เตรียม
- [x] สร้าง branch `course-system` จาก `main` (656865ff) แล้ว commit การย้ายแผนเดิมไป `tasks/archive/lab-layout/` พร้อม `tasks/plan.md` และ `tasks/todo.md` ฉบับนี้
- [x] รัน `scripts/check.sh` เก็บผลเป็นเส้นฐาน (ควรเห็นเทสต์ SURF ล้ม 15 ตัวตาม `tasks/baseline/test-baseline.json`)
- [x] เตรียมฐานชั่วคราวพร้อมบัญชี admin, ผู้สอน A, ผู้สอน B, ผู้เรียน แล้วถ่ายภาพ `/courses`, `/teach` และ `/` ก่อนเริ่มงาน
- ขนาด: XS
- ผลตรวจ (25 พ.ย. 2569)
  - ขั้นที่ 0: ผู้ใช้สร้าง branch และ commit แผนเอง (`227537f3` ย้ายแผนเดิมบน `main`, `02156b1a` แผนใหม่บน `course-system`) จึงไม่ทำ commit ซ้ำ (ผู้ใช้ตอบให้ทำต่อ)
  - เส้นฐาน: `CHECK PASS` (BE ผ่าน 381, ล้ม 15 = SURF ชุดเดิม, node --test 9/9, lint error 0 warning 0, build ผ่าน) · `ui_checks.py` 18/18 (ข้าม 1: A4e/A4f) · `ui_checks_phase3.py` 23/23 · `ui_checks_touch.py` 19/19
  - ภาพก่อนทำ 12 ภาพ: `outputs/course-system/T0__*` (`/courses` ผู้เยี่ยมชม, `/teach` ผู้สอน A, `/` ผู้เรียน ที่ 1440/375 มืด/สว่าง) โฟลเดอร์ `outputs/` ไม่เข้า git
  - ฐานชั่วคราว (ใช้ซ้ำได้): ฐาน `viper_course_tmp` ใน container เดิม แยกจาก `viper_db`
    1. สร้าง: `docker exec viper_postgres sh -c 'createdb -U "$POSTGRES_USER" viper_course_tmp'`
    2. สคริปต์ Python ตั้ง `os.environ["DATABASE_URL"]` ก่อน import `server` โดยเอาค่าจาก `.env` แล้วเปลี่ยนชื่อฐานด้วย `make_url(raw).set(database="viper_course_tmp").render_as_string(hide_password=False)` ตั้ง `AUTO_CREATE_TABLES=true` และ `assert engine.url.database == "viper_course_tmp"`
    3. เปิดแอปในโปรเซสด้วย `TestClient(app).__enter__()` (lifespan รัน `create_all`) จึงไม่ต้องเปิด backend อีกพอร์ต
    4. บัญชี (id ตั้งเอง ไม่ชนกับ id 4): 101 admin (`role=admin`), 102 Teacher A, 103 Teacher B (`can_teach`), 104 Learner
    5. login: cookie `viper_session` = `_session_cookie(user_id, settings.session_secret)` ใส่ใน Playwright context ที่ `http://localhost:5173`
    6. ใช้ `context.route` ส่ง `/api/**` และ `/static/**` จาก vite :5173 เข้า TestClient (ส่งต่อ header `cookie`, `content-type`) คำขอจึงไม่ไปถึง backend :8000 ที่ต่อฐานจริง
    7. ทุกครั้งที่เปิดบทบาท ให้ fetch `/api/auth/me` แล้ว assert id, role, can_teach (ผู้เยี่ยมชมต้องได้ 401)

### [x] T1 Backend: คอร์ส (สร้าง ดู แก้)
- เกณฑ์รับ
  - [x] model `Course` ใน `server/models.py` ตาม plan (CheckConstraint ของสถานะ, partial unique index ของ `code` เฉพาะแถว `deleted_at IS NULL` ที่ใช้ได้ทั้ง PostgreSQL และ SQLite)
  - [x] สุ่มรหัส `VP-XXXXXX` เมื่อ `code` ว่าง (ชุดอักษร `ABCDEFGHJKMNPQRSTUVWXYZ23456789`) และสุ่มใหม่ถ้าซ้ำ ส่วนรหัสที่กรอกเองให้ strip, แปลงเป็นตัวพิมพ์ใหญ่ และยาวไม่เกิน 20 ถ้าซ้ำตอบ 409
  - [x] endpoint `GET /api/courses` (optional user, Published เรียง updated_at ใหม่ก่อน, ตอบ `{items, next:null}`, limit ≤100 พร้อมคอมเมนต์ `# shortcut: หน้าเดียว ไม่มี cursor, ทำ cursor เมื่อคอร์สเกิน 100`), `GET /api/courses/managed` (ต้องเป็น admin หรือ can_teach ไม่งั้น 403 ผู้สอนเห็นของตัวเอง admin เห็นทั้งหมด), `POST /api/courses` (สร้างเป็น Draft ตอบ 201), `GET /api/courses/{id}` (มองไม่เห็นตอบ 404) และ `PATCH /api/courses/{id}` (แก้ code, title, description ต้องเป็นผู้จัดการ)
  - [x] response ใช้ชื่อแบบ snake_case ตามธรรมเนียมของ `server/schemas.py` (เช่น `TemplateSummary` :137) แล้วให้ `learningApi.ts` แปลงเป็น type `Course` (`platform/types.ts:22`) ที่ใช้ camelCase ส่วน lesson_count, enrolled_count และ enrolled ให้เป็น 0/false ไปก่อน (T3 และ T6 จะเติม) และ can_manage ต้องถูกต้อง
  - [x] บันทึก audit `course.create` และ `course.update` ด้วยรูปแบบ `_add_audit`
  - [x] เทสต์ใน `tests/test_courses_api.py` (ใช้ `make_engine`/`make_client`/`add_user`/`authenticate` แบบ `tests/test_templates_api.py:24–56`):
    - ไม่มี can_teach ได้ 403 ทั้ง `/managed` และ POST
    - Draft ได้ 404 สำหรับผู้เรียน ผู้สอนคนอื่น และผู้เยี่ยมชม แต่เจ้าของกับ admin เห็น
    - ถอน can_teach แล้ว PATCH ไม่ได้ทันที
    - รหัสว่างได้ `VP-` + 6 ตัว
    - `img-101` ซ้ำกับ `IMG-101` ได้ 409
- ตรวจ: `.venv/bin/python -m pytest tests/test_courses_api.py -q` แล้ว `scripts/check.sh`
- ไฟล์: `server/models.py`, `server/schemas.py`, `server/routers/courses.py` (ใหม่), `server/main.py`, `tests/test_courses_api.py` (ใหม่)
- ขึ้นกับ: T0
- ขนาด: M
- ผลตรวจ (25 พ.ย. 2569)
  - `tests/test_courses_api.py` ผ่าน 22/22 · `scripts/check.sh` `CHECK PASS` (BE ผ่าน 403 = 381 + 22, ล้ม SURF 15 เท่าเดิม)
  - บน PostgreSQL (ฐานชั่วคราว) มี `ix_courses_code_active ... WHERE (deleted_at IS NULL)` และ `ck_courses_status` ส่วน partial index บน SQLite มีเทสต์ครอบ
  - เรื่องถอน `can_teach`: คอร์ส Published ได้ 403 แต่คอร์ส Draft/Archived ได้ 404 ตามกติกา "มองไม่เห็นตอบ 404" (เจ้าของที่ถูกถอนสิทธิ์มองไม่เห็น Draft แล้ว) เทสต์ครอบทั้งสองกรณี เทสต์ 403 ตั้ง status ผ่าน session เพราะยังไม่มี Publish
  - `PATCH` ที่ส่ง `code` ว่างหรือ null คงรหัสเดิม · ถ้าไม่มีค่าเปลี่ยน จะไม่บันทึก audit
  - backend :8000 (`--reload`, ต่อ `viper_db`, `AUTO_CREATE_TABLES=true`) ถูกปิดก่อนแก้ `server/` ตามที่ผู้ใช้สั่ง ฐานจริงยังไม่มีตาราง `courses`

### [x] T2 UI: ผู้สอนสร้างและแก้คอร์ส
- เกณฑ์รับ
  - [x] `learningApi.ts`: เปลี่ยนเนื้อ `listCourses`, `listManagedCourses` และ `getCourse` (404 ให้คืน null) เป็น apiFetch แล้วเพิ่ม `createCourse` และ `updateCourse` ข้อความ error ไทย:
    - 403 → "ไม่มีสิทธิ์จัดการคอร์สนี้"
    - 404 → "ไม่พบคอร์สหรือบทเรียน"
    - 409 → "รหัสคอร์สนี้ถูกใช้แล้ว"
    - อื่นๆ → "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"
  - [x] `TeachPage.tsx`: เปิดปุ่ม "สร้างคอร์ส" (:62) และ "สร้างคอร์สแรก" (:104) ให้เปิด `CourseForm` modal (port จาก `Teaching.jsx:8`):
    - รหัสคอร์ส maxLength 20 ไม่บังคับ placeholder "เว้นว่างเพื่อให้ระบบตั้งให้ เช่น VP-7K2Q9M"
    - ชื่อคอร์ส required ≤120
    - คำอธิบาย required ≤1000 แบบ textarea 4 แถว
    - หมายเหตุ "คอร์สใหม่เริ่มเป็น Draft ผู้เรียนยังไม่เห็นจนกว่าจะ Publish"
    - สร้างสำเร็จ: toast "สร้างคอร์ส Draft แล้ว เพิ่มบทเรียนได้เลย" แล้วไป `/teach/:id`
  - [x] ปุ่ม "แก้ข้อมูลคอร์ส" (:153) เปิด CourseForm พร้อมค่าเดิม บันทึกแล้ว toast "บันทึกข้อมูลคอร์สแล้ว" ระหว่างส่ง request ปุ่มต้องกดไม่ได้ ถ้า error ให้ toast และคงค่าในฟอร์มไว้
  - [x] ปุ่ม "ออกแบบ Lab" (:58, :157) ยังปิดอยู่ ให้ใช้ title จากค่าคงที่ใหม่ `LAB_DESIGNER_LATER = 'ตัวออกแบบ Lab จะเพิ่มรอบหน้า'`
  - [x] เพิ่ม stub `createCourse` และ `updateCourse` ใน `FAKE` ของ `scripts/ui_checks_phase3.py:9`
- ตรวจ: เบราว์เซอร์ ผู้สอน A สร้างคอร์สโดยเว้นรหัสว่าง (ได้ VP-) แล้วสร้างอีกคอร์สด้วยรหัสซ้ำ (ต้องเห็นข้อความ 409) admin ต้องเห็นคอร์สของ A ใน `/teach` พร้อม "ผู้สอน <ชื่อ>" ส่วนผู้สอน B เปิด `/teach/:id` ของ A ต้องเห็น "จัดการคอร์สนี้ไม่ได้" ที่จอ 375 modal ต้องไม่ล้น (`getBoundingClientRect().right ≤ 375` และ body ไม่มี scroll แนวนอน)
- ไฟล์: `src/lib/learningApi.ts`, `src/platform/pages/TeachPage.tsx`, `scripts/ui_checks_phase3.py`
- ขึ้นกับ: T1
- ขนาด: M
- ผลตรวจ (25 พ.ย. 2569)
  - `scripts/check.sh` `CHECK PASS` (BE ผ่าน 403, ล้ม SURF 15, node --test 9/9) · `npx tsc -b` ไม่มี error · `ui_checks.py` 18/18 (ข้าม A4e/A4f เท่าเดิม) · `ui_checks_phase3.py` 23/23 · `ui_checks_touch.py` 19/19
  - เบราว์เซอร์ (Playwright + ฐานชั่วคราว ตรวจ `/api/auth/me` ทุกครั้งที่เปิดบทบาท): a–f ผ่านครบ · 1440/375 มืด/สว่าง `/teach`, `/teach/:id`, CourseForm (สร้างและแก้) ไม่มี scroll แนวนอน และ modal ที่ 375 ได้ left=16 right=359
  - ปุ่ม submit ระหว่างส่ง: `disabled`, opacity 1 → 0.48, cursor pointer → not-allowed
  - console: ไม่มี error นอกจากบรรทัด network ของเบราว์เซอร์จากคำตอบที่ตั้งใจให้เกิด คือ 409 (ข้อ b), 404 (ข้อ e) และ 401 `/api/auth/me` ของผู้เยี่ยมชม
  - ภาพ: `outputs/course-system/T2__*` (a–f ขึ้นต้นด้วย `T2__a-` ถึง `T2__f-`)
  - พบแต่ยังไม่แก้: ชื่อหรือคำอธิบายที่ยาวต่อกันโดยไม่มีช่องว่าง ที่จอ 375 ล้นและถูกตัดใน `/teach` กับ `/teach/:id` (หน้าไม่เลื่อนแนวนอน) · ข้อความ "จัดการคอร์สนี้ไม่ได้" ยังต่อท้ายด้วย `COMING_LATER` · toast ตอน error ใช้ไอคอนเครื่องหมายถูกของ toast กลางเดิม

### จุดตรวจ 1
- [x] `CHECK PASS`, tsc ไม่มี error และสคริปต์ UI ผ่าน
- [ ] **ให้ผู้ใช้ดูภาพ `/teach` และ CourseForm ก่อนทำ T3**

### [ ] T3 Backend: บทเรียน
- เกณฑ์รับ
  - [ ] model `Lesson` ตาม plan และ `lessonCount` ของคอร์สนับเฉพาะบทที่ยังไม่ลบ
  - [ ] endpoint ทั้งหมด (สิทธิ์ผู้จัดการตาม T1):
    - `GET /api/courses/{id}/lessons`: ผู้จัดการได้บทเต็ม คนอื่นได้ content_md ว่าง ส่วน T6 จะเปิดให้ผู้ลงทะเบียน
    - `POST /api/courses/{id}/lessons`: ต่อท้ายที่ position N+1 และตั้งชื่อ "บทเรียนที่ N"
    - `GET /api/lessons/{id}`: ผู้จัดการได้ `{locked:false, lesson}` คอร์ส Published ได้ `{locked:true, lesson: preview}` และมองไม่เห็นได้ 404
    - `PATCH /api/lessons/{id}`: title บังคับ ≤120, subtitle ≤200, content_md ≤20000, minutes ให้อยู่ในช่วง 1–600, level ต้องเป็น 1 ใน 3 ค่า ไม่งั้น 422
    - `DELETE /api/lessons/{id}`: soft delete แล้วจัด position ที่เหลือเป็น 1..N
    - `POST /api/lessons/{id}/move` รับ `{direction:-1|1}`: ถ้าอยู่ขอบคืนค่าเดิมโดยไม่ error
  - [ ] Lesson response มี `activity: null` เสมอ และบันทึก audit `lesson.create`, `lesson.update`, `lesson.delete` (move ไม่บันทึก)
  - [ ] เทสต์: ผู้สอนคนอื่นแก้หรือลบบทได้ 404 ลบแล้ว position ต่อเนื่อง move ที่ขอบไม่ error และผู้ไม่ใช่ผู้จัดการได้ content_md ว่าง
- ตรวจ: pytest ไฟล์เดียว แล้ว `scripts/check.sh`
- ไฟล์: `server/models.py`, `server/schemas.py`, `server/routers/courses.py`, `tests/test_courses_api.py`
- ขึ้นกับ: T1
- ขนาด: M

### [ ] T4 UI: ผู้สอนจัดการบทเรียน
- เกณฑ์รับ
  - [ ] `learningApi.ts`: เปลี่ยนเนื้อ `listLessons` และ `getLesson` แล้วเพิ่ม `createLesson`, `updateLesson`, `deleteLesson`, `moveLesson` (และเพิ่ม stub ใน FAKE)
  - [ ] ส่วน "บทเรียน" ใน CourseEditor (หัว "เรียงลำดับ แก้เนื้อหา และออกแบบ Lab ของแต่ละบท") มีปุ่ม "เพิ่มบทเรียน" กดแล้วเปิด LessonEditor ของบทใหม่ทันที แต่ละแถวมี:
    - เลขบท ชื่อ และ "คำโปรย · N นาที"
    - Badge neutral "ยังไม่มี Lab"
    - ปุ่มไอคอนขึ้น/ลง (ปิดเมื่ออยู่ขอบ aria-label "เลื่อน <ชื่อ> ขึ้น/ลง"), แก้ และลบ (confirm "ลบบทเรียน <ชื่อ>?")
    - ถ้าไม่มีบท แสดง "ยังไม่มีบทเรียน กด “เพิ่มบทเรียน” เพื่อเริ่ม"
  - [ ] `LessonEditor` modal แบบ wide (port จาก `Teaching.jsx:25`):
    - ชื่อ คำโปรย เวลา (นาที) และระดับ (select 3 ค่า)
    - เนื้อหา Markdown พร้อมปุ่มสลับ "พรีวิว" ที่ใช้ `<Markdown>` (`ui.tsx:173`)
    - ปุ่มบันทึกปิดเมื่อชื่อว่าง บันทึกแล้ว toast "บันทึกบทเรียนแล้ว"
  - [ ] ที่จอ 375 ปุ่มไอคอนในแถวบทเรียนต้องไม่ทับชื่อ (ตรวจด้วย getBoundingClientRect)
- ตรวจ: เบราว์เซอร์ เพิ่ม 3 บท แก้เนื้อหาบท 1 แล้วพรีวิว เลื่อนบท 3 ขึ้น ลบบท 2 แล้ว reload ลำดับต้องคงอยู่
- ไฟล์: `src/lib/learningApi.ts`, `src/platform/pages/TeachPage.tsx`, `scripts/ui_checks_phase3.py`
- ขึ้นกับ: T2, T3
- ขนาด: M

### [ ] T5 Publish / Unpublish / Archive
- เกณฑ์รับ
  - [ ] `POST /api/courses/{id}/status` รับ `{status}` (ต้องเป็นผู้จัดการ) ถ้า Publish แล้วติด blocker ตอบ 409 พร้อมรายการ blocker และบันทึก audit `course.status` พร้อม details `{from,to}`
  - [ ] ค่าคงที่ `PUBLISH_REQUIRES_LAB = False` อยู่บนสุดของ `courses.py` พร้อมคอมเมนต์:
    - เมื่อเป็น False: blocker คือ "ต้องมีบทเรียนอย่างน้อย 1 บท" และ "ต้องมีบทที่มีเนื้อหาอย่างน้อย 1 บท"
    - เมื่อเป็น True: ให้ raise `NotImplementedError` (รอ lab_activities)
  - [ ] response ของคอร์สมี `publishBlockers: string[]` ส่งเฉพาะผู้จัดการ และใน `types.ts` เพิ่มเป็น field optional
  - [ ] แผง "สถานะคอร์ส" แสดง "แก้ไขล่าสุด <เวลา>" ถ้ามี blocker ให้แสดงใน `.validation-message` และปิดปุ่ม Publish ปุ่มตามสถานะ (ทุกปุ่มถาม confirm ก่อน ข้อความ Publish คือ "Publish คอร์สนี้? ผู้เรียนจะเห็นคอร์สและลงทะเบียนได้"):
    - Draft → Publish
    - Published → Unpublish เป็น Draft, Archive
    - Archived → Publish อีกครั้ง
  - [ ] `CoursesPage.tsx`: ข้อความที่ :133, :158 และ :252 ให้ตัดวงเล็บ `COMING_LATER` ออก และผู้สอนต้องพรีวิว `/courses/:id` ของคอร์ส Draft ได้ (`canManage`)
  - [ ] เทสต์: Publish ตอนไม่มีบทได้ 409 มีบทแต่เนื้อหาว่างได้ 409 เพิ่มเนื้อหาแล้วผ่าน หลัง Publish `GET /api/courses` ของผู้เยี่ยมชมเห็นคอร์ส และหลัง Unpublish หรือ Archive ผู้เยี่ยมชมไม่เห็น
- ตรวจ: เบราว์เซอร์ ทำ flow ผู้สอนครบ (สร้าง → บท → blocker → Publish → ผู้เยี่ยมชมเห็นใน `/courses` → Unpublish → Archive) และใช้ getComputedStyle ยืนยันว่าปุ่ม Publish ที่ disabled ใช้สไตล์ disabled เดิม
- ไฟล์: `server/routers/courses.py`, `server/schemas.py`, `tests/test_courses_api.py`, `src/platform/types.ts`, `src/platform/pages/TeachPage.tsx`, `src/platform/pages/CoursesPage.tsx`
- ขึ้นกับ: T4
- ขนาด: M

### จุดตรวจ 2: flow ผู้สอนครบ
- [ ] `CHECK PASS`, tsc และสคริปต์ UI ผ่าน
- [ ] **ให้ผู้ใช้ดูภาพ flow ผู้สอนทั้งชุดก่อนทำ T6**

### [ ] T6 Backend: ลงทะเบียนและยกเลิก
- เกณฑ์รับ
  - [ ] model `Enrollment` (unique course_id + user_id, status `active|cancelled`)
  - [ ] `POST /api/courses/{id}/enroll`:
    - ได้เฉพาะคอร์ส Published และผู้ที่ไม่ใช่ผู้จัดการคอร์สนั้น (ผู้จัดการได้ 409 คอร์สสถานะอื่นได้ 409)
    - ถ้าเคยยกเลิก ให้เปลี่ยนแถวเดิมกลับเป็น active และถ้า active อยู่แล้วให้คืน 200 โดยไม่สร้างแถวซ้ำ
    - audit `enrollment.create`
  - [ ] `POST /api/courses/{id}/unenroll`: เปลี่ยนเป็น cancelled ทำได้ทุกสถานะคอร์ส แล้ว audit `enrollment.cancel`
  - [ ] การมองเห็นตาม plan ข้อ 4: `GET /api/courses` คืน Published และคอร์ส Draft/Archived ที่ผู้เปิดลงทะเบียน active อยู่ ส่วน `enrolled` และ `enrolledCount` (นับเฉพาะ active) ต้องถูกต้อง
  - [ ] เนื้อหาบทเรียน (lessons และ getLesson `locked:false`) เปิดให้เฉพาะผู้จัดการหรือผู้ลงทะเบียน active ส่วนผู้ที่ยกเลิกแล้วได้ locked หรือ 404 ตามสถานะคอร์ส
  - [ ] `GET /api/courses/{id}/enrollments` (เฉพาะผู้จัดการ) คืน `[{userId, name, email, enrolledAt}]` เฉพาะ active
  - [ ] เทสต์ (ครบทุกบทบาท):
    - ลงทะเบียนแล้วอ่านบทได้
    - ยกเลิกแล้วอ่านไม่ได้ แต่ลงทะเบียนใหม่ได้
    - Unpublish แล้วผู้ลงทะเบียนยังอ่านได้ แต่คนใหม่ได้ 404
    - Archive แล้วผู้ลงทะเบียนอ่านได้ แต่คนใหม่ลงทะเบียนไม่ได้
    - ยกเลิกใน Archived แล้วลงทะเบียนกลับไม่ได้
    - ผู้จัดการลงทะเบียนคอร์สตัวเองได้ 409
    - ผู้สอน B ลงทะเบียนคอร์สของ A ได้
    - รายชื่อผู้ลงทะเบียน: ผู้เรียนได้ 404 หรือ 403
- ตรวจ: pytest ไฟล์เดียว แล้ว `scripts/check.sh`
- ไฟล์: `server/models.py`, `server/schemas.py`, `server/routers/courses.py`, `tests/test_courses_api.py`
- ขึ้นกับ: T5
- ขนาด: M

### [ ] T7 UI: ลงทะเบียน อ่านบท รายชื่อ และ Dashboard
- เกณฑ์รับ
  - [ ] `learningApi.ts`: เพิ่ม `enrollCourse`, `unenrollCourse`, `listEnrollments` (stub ใน FAKE ด้วย) และเพิ่ม type `CourseEnrollment` ใน `types.ts`
  - [ ] `CoursesPage.tsx`:
    - เปิดปุ่ม "ลงทะเบียนเรียน" (:184 และปุ่มบนการ์ด :89) ลงทะเบียนสำเร็จให้ toast และแสดงบทเรียนที่อ่านได้ทันที ผู้เยี่ยมชมยังถูกพาไป `/login?next=/courses/<id>` แบบเดิม
    - ปุ่มรอง "ยกเลิกการลงทะเบียน" พร้อม confirm ถ้าคอร์ส Archived ข้อความต้องเป็น "คอร์สนี้ปิดรับแล้ว ยกเลิกแล้วจะกลับมาอ่านไม่ได้"
    - ผู้จัดการคอร์สไม่เห็นปุ่มทั้งสอง
  - [ ] ปุ่ม "เปิด Lab ของบทนี้" (:301) ยังปิดอยู่ ใช้ title `LAB_DESIGNER_LATER` หรือข้อความที่มีความหมายเดียวกัน
  - [ ] `TeachPage.tsx` CourseEditor: เพิ่มส่วน "ผู้ลงทะเบียน (N)" เป็นตาราง ชื่อ อีเมล วันที่ลงทะเบียน เปิดให้ดูอย่างเดียว พร้อมป้ายเล็ก (muted small) "การนำผู้เรียนออกจะเพิ่มภายหลัง" และคอมเมนต์ `// TODO(course-remove-learner): ผู้สอนเอาผู้เรียนออก (ดู tasks/plan.md คำถามที่ยังเปิด)` ที่จอ 375 ตารางต้องไม่ทำให้ body เลื่อนแนวนอน
  - [ ] `DashboardPage.tsx` (:51): ผู้เรียนที่มีคอร์ส active เห็นรายการคอร์สพร้อมลิงก์ไป `/courses/:id` ถ้ายังไม่มีคอร์ส ให้แสดง Empty แบบเดิม (แก้ข้อความให้ชวนไป `/courses`) ส่วนไทม์ไลน์ ความคืบหน้า และงานกำหนดส่งยังว่าง
- ตรวจ: เบราว์เซอร์
  - ผู้เรียน: ลงทะเบียน → อ่านบท → Dashboard เห็นคอร์ส → ยกเลิก → บทล็อก → ลงทะเบียนใหม่
  - ผู้สอน A: เห็นชื่อผู้เรียนในรายชื่อ
  - ผู้เยี่ยมชม: กดลงทะเบียนแล้วไปหน้า login และ `/lessons/:id` ต้อง redirect
- ไฟล์: `src/lib/learningApi.ts`, `src/platform/types.ts`, `src/platform/pages/CoursesPage.tsx`, `src/platform/pages/TeachPage.tsx`, `src/platform/pages/DashboardPage.tsx` (+ FAKE)
- ขึ้นกับ: T6
- ขนาด: M (5 ไฟล์ ถ้าใหญ่เกินไปให้แยกส่วน Dashboard เป็น T7b)

### จุดตรวจ 3
- [ ] `CHECK PASS`, tsc และสคริปต์ UI ผ่าน
- [ ] **ให้ผู้ใช้ดูภาพ flow ผู้เรียนก่อนทำ T8**

### [ ] T8 ลบคอร์ส (ผู้สอนและ admin)
- เกณฑ์รับ
  - [ ] `DELETE /api/courses/{id}` รับ body `{reason?}`:
    - ผู้สอนเจ้าของลบได้เฉพาะ Draft ที่ไม่มีผู้ลงทะเบียน active (ไม่งั้นตอบ 409)
    - admin ลบได้ทุกสถานะ แต่ถ้าคอร์สไม่ใช่ Draft หรือมีผู้ลงทะเบียน ต้องมี reason 1–500 ตัวอักษร (ไม่งั้นตอบ 422)
    - เป็น soft delete ทั้งคอร์สและบทเรียน ตอบ 204
    - audit `course.delete` พร้อม details `{status, enrolledCount, reason}`
  - [ ] คอร์สที่ลบแล้วหายจากทุก list และทุก endpoint ตอบ 404 รวมผู้ที่ลงทะเบียนไว้ และ Dashboard ของผู้เรียนต้องไม่แสดงคอร์สนั้น
  - [ ] สร้างคอร์สใหม่ด้วยรหัสของคอร์สที่ลบไปแล้วได้
  - [ ] UI:
    - ผู้สอนเห็นปุ่ม "ลบคอร์ส" เฉพาะ Draft ที่ไม่มีผู้ลงทะเบียน (confirm "ลบคอร์ส Draft นี้? บทเรียนทั้งหมดจะถูกลบด้วย")
    - admin เห็นปุ่มทุกสถานะ เปิด Modal ที่มีช่องเหตุผล (required 1–500) และข้อความ "มีผู้ลงทะเบียน N คน จะเข้าถึงคอร์สนี้ไม่ได้อีก"
    - ลบแล้วกลับไป `/teach` และ toast
  - [ ] `learningApi.ts` เพิ่ม `deleteCourse` (stub ใน FAKE ด้วย) และเพิ่มเทสต์ครอบทุกกรณีข้างบน
- ตรวจ: เบราว์เซอร์ ผู้สอนลบ Draft ส่วน admin ลบคอร์ส Published ที่มีผู้เรียน (ลองกดลบโดยไม่กรอกเหตุผล ต้องไม่ผ่าน) แล้วผู้เรียน reload Dashboard และ `/courses/:id` ต้องไม่เห็นคอร์ส
- ไฟล์: `server/routers/courses.py`, `server/schemas.py`, `tests/test_courses_api.py`, `src/lib/learningApi.ts`, `src/platform/pages/TeachPage.tsx` (+ FAKE)
- ขึ้นกับ: T7
- ขนาด: M

### [ ] T9 ป้าย audit, parity และตรวจรวม
- เกณฑ์รับ
  - [ ] เพิ่มป้าย 9 action ใหม่ใน `components/AdminAuditLogView.tsx:26` (เช่น `'course.create': 'Created course'`) หน้า audit log ต้องไม่แสดง key ดิบ
  - [ ] `tasks/parity.md`: ปรับสถานะแถว P-05, P-06, P-07, P-09, P-11, C-18, C-19 และ P-02 (ส่วนคอร์ส) จาก `ว่างตามแผน` เป็นของจริง พร้อมอ้างงาน T1–T8 ส่วน P-12 คงสถานะเดิม
  - [ ] ตรวจรวมทุกบทบาท (admin, ผู้สอน A, ผู้สอน B, ผู้เรียน, ผู้เยี่ยมชม) ที่จอ 1440/375 ทั้งธีมมืดและสว่าง console ต้องไม่มี error ยกเว้น 401 ของ `/api/auth/me` สำหรับผู้เยี่ยมชม (ตั้งใจให้เกิด ตาม parity P-05)
  - [ ] grep ต้องไม่เหลือ `ระบบคอร์สจะเพิ่มภายหลัง` ในที่ที่ระบบทำงานจริงแล้ว และ `LAB_DESIGNER_LATER` ต้องยังอยู่
- ตรวจ: `scripts/check.sh`, tsc และสคริปต์ UI ทั้ง 3 ตัว พร้อมเก็บภาพครบชุดใน `outputs/course-system/`
- ไฟล์: `src/components/AdminAuditLogView.tsx`, `tasks/parity.md`
- ขึ้นกับ: T8
- ขนาด: S

### จุดตรวจสุดท้าย
- [ ] `CHECK PASS` และสคริปต์ UI ผ่าน
- [ ] รายงานรายการ endpoint จำนวนเทสต์ ภาพ flow ผู้สอนและผู้เรียน และสิ่งที่ยังไม่ได้ตรวจ
- [ ] ผู้ใช้ดูของจริงแล้วอนุมัติ
- [ ] ห้าม push/merge จนกว่าผู้ใช้จะสั่ง
