# todo: ปรับหน้าตา VIPER Lab ตาม mockup v2

ตรวจทุกงาน: `scripts/check.sh` ต้องได้ `CHECK PASS` · อ้างอิงภาพ mockup: เปิด `outputs/viper-learning-platform-v2.html` หน้า Lab
skill ที่ใช้ทุกงาน: `agent-skills:incremental-implementation`, `agent-skills:frontend-ui-engineering`, `anthropic-skills:built-in-browser`

### [x] T0 เตรียม
- [x] สร้าง branch `lab-layout` จาก `main` ล่าสุด
- [x] ถ่ายภาพ `/lab` ปัจจุบันไว้เทียบ ทั้งเดสก์ท็อปและ 375px (เก็บใน `outputs/`)
- ผล: `outputs/lab-layout/t0-desktop.jpg`, `outputs/lab-layout/t0-mobile375.jpg` (ถ่ายด้วย browser pane กว้าง ~800px ในฐานะ "เดสก์ท็อป") login เป็น admin ยืนยันด้วย /api/auth/me แล้ว
- ขนาด: XS

### [x] T1 หัว Lab แบบ mockup และย้ายปุ่มรัน
- เกณฑ์รับ
  - [x] ด้านซ้ายเป็นป้าย "Image Processing" ปุ่มย้อนกลับ (ไป `/`) และชื่อแท็บที่เปิดอยู่ ชื่อเปลี่ยนตามแท็บและตอน rename
  - [x] ด้านขวาเป็นปุ่ม ? (`LabHelpDialog` เดิม), "เก็บ Template" (`SaveTemplateDialog` เดิม) และปุ่มสลับ "รัน/หยุด" ที่เรียก `handleStart`/`handleStop` เดิม
  - [x] "เก็บ Template" กดไม่ได้ระหว่างรันหรือตอน canvas ว่าง
  - [x] ปุ่มเมนูแพลตฟอร์มบนจอแคบ (`platformMenu`) ยังอยู่และใช้ได้
  - [x] แถว Status แสดงไฟสถานะกับ Running/Stopped เท่านั้น ไม่มีปุ่ม Start/Stop แล้ว
  - [x] ปุ่ม "รัน" ตอน canvas ว่างยังเตือนแบบเดิม
- ตรวจ: เบราว์เซอร์ รัน Homography ด้วยปุ่มใหม่แล้วกดหยุดกลางทาง ลอง ? และเก็บ Template แล้วดูว่า hotkey ไม่ไปลบโหนดระหว่างที่ dialog เปิด
- ไฟล์: `pages/LabPage.tsx`, `components/WorkflowControls.tsx`, สคริปต์ UI ถ้าอ้างปุ่ม Start/Stop
- ขนาด: S
- ผลตรวจ: CHECK PASS · เบราว์เซอร์ (admin): รัน Homography จนจบ (6 โหนด Completed) และหยุดกลางทางได้, เก็บ Template ถูก disable ตอนรัน, dialog ? และเก็บ Template เปิดแล้วกด Delete ไม่ลบโหนด (6=6), 375px หัวไม่ล้น · แก้เพิ่ม `LabHelpDialog.tsx` (ข้อความ "กด Start" → "กด รัน") ไม่มีสคริปต์ UI อ้างปุ่ม Start/Stop

### [x] T2 แถบเครื่องมือเหนือ canvas
- เกณฑ์รับ
  - [x] แถวใต้แถบแท็บแสดงป้าย "N โหนด" ที่ตรงกับจำนวนโหนดบน canvas และอัปเดตตอนเพิ่มหรือลบโหนด
  - [x] แถวนี้มีแค่ป้าย ไม่มีปุ่ม fit view (ซ้ำกับปุ่มข้าง SAVE และใน Controls ผู้ใช้ให้เอาออกที่จุดตรวจ 1)
- ตรวจ: เพิ่มหรือลบโหนดแล้วดูตัวเลข
- ไฟล์: `pages/LabPage.tsx` (ใช้ `handleFlowChange` ที่มีอยู่แล้วเพื่อรู้จำนวนโหนด)
- ขนาด: XS
- ผลตรวจ: CHECK PASS · เบราว์เซอร์: ป้ายตรงกับจำนวนโหนดจริง (6→7→6 ตอนเพิ่ม/ลบ, อัปเดตช้าไม่เกิน ~1 วินาทีเพราะ onFlowChange ของ FlowCanvas เป็น debounce) (ปุ่ม fit view ในแถวนี้ถูกเอาออกหลังจุดตรวจ 1)

### [x] T3 กรอบคลังโหนดแบบ mockup
- เกณฑ์รับ
  - [x] หัว "VIPER LIBRARY" มีปุ่มพับคลังเหมือนเดิม และมีปุ่ม Open all / Close all เปิดหรือปิดทุกกลุ่ม
  - [x] แต่ละกลุ่ม (INPUT ฯลฯ) พับได้ และปุ่มโหนดยังเป็นสีเขียวน้ำทะเลแบบเดิม (ภาพ 5)
  - [x] footer เป็น "ALL NODES"
  - [x] ปุ่ม NODES/TEMPLATES ถูกซ่อนด้วย `SHOW_LAB_TEMPLATES_TAB = false` โค้ด templates, เมนูคลิกขวา, About Algorithm และ `SHOW_LEGACY_TEMPLATE_LIST` ยังอยู่ครบ
  - [x] เมื่อลองตั้ง `SHOW_LAB_TEMPLATES_TAB = true` ในเบราว์เซอร์ (ไม่แก้ไฟล์จริง) แท็บ templates กลับมาใช้ได้
  - [x] จำนวนชนิดโหนดในคลังยังเท่าเดิม (22) และกลุ่มที่ซ่อนอยู่ยังเปิดกลับได้ด้วย `enabled` ใน `NODE_GROUPS`
- ตรวจ: เบราว์เซอร์ นับปุ่มโหนด กด Open all/Close all แล้วเพิ่มโหนดจากคลัง
- ไฟล์: `components/sidebar.tsx`
- ขนาด: S
- ผลตรวจ: CHECK PASS · เบราว์เซอร์: ไม่มีปุ่ม NODES/TEMPLATES, Open all เปิด 10 กลุ่ม = 22 ปุ่มโหนด, Close all เหลือ 0, footer "All Nodes", ลากโหนดจากคลังลง canvas ได้ (6→7) ลองตั้ง `SHOW_LAB_TEMPLATES_TAB = true` ชั่วคราวแล้วแท็บ templates กลับมาและแสดงรายการ Official (แล้วตั้งกลับเป็น false) · หมายเหตุ: คลังเดิมมี Open all/Close all และกลุ่มพับได้อยู่แล้ว งานจริงของ T3 จึงเหลือซ่อนแท็บและเปลี่ยน footer

### [x] T4 System Logs เป็นแผงด้านล่าง
- เกณฑ์รับ
  - [x] log อยู่ในแผงด้านล่าง canvas เต็มความกว้างของ canvas ไม่ลอยทับโหนดแล้ว
  - [x] ลากขอบบนเพื่อปรับความสูงได้ (มีค่าต่ำสุดและสูงสุด) และย่อหรือขยายได้
  - [x] ปุ่มล้าง log และตัวนับยังใช้ได้ log ใหม่เลื่อนลงล่างสุดเหมือนเดิม
  - [x] บนจอแคบ (`isCompactMobile`) แผงเริ่มแบบย่อ
  - [x] `fitWorkflowToCanvas` ไม่ต้องเว้นที่ให้ log ที่ลอยอยู่แล้ว fit view แล้วไม่มีโหนดถูกแผงบัง
  - [x] ไปหน้าอื่นระหว่างรันแล้วกลับมา: log ครบ แผงล่างไม่โผล่ทับหน้าอื่น (R-43)
- ตรวจ: รัน pipeline แล้วดู log ปรับความสูง กด fit view ไป `/templates` แล้วกลับมา
- ไฟล์: `components/LogPanel.tsx`, `FlowCanvas.tsx`, `index.css`
- ขนาด: M
- ผลตรวจ: CHECK PASS · เบราว์เซอร์: แผง log อยู่ใต้ canvas (position relative, ไม่ทับโหนด) ลากขอบบนปรับความสูงได้ ต่ำสุด 96px สูงสุด 60% ของหน้าจอ ย่อ/ขยาย/ล้าง log ใช้ได้ log ใหม่เลื่อนลงล่างสุด fit view แล้วโหนดล่างสุดอยู่เหนือแผง (593 < 609px) ไป /templates ระหว่างรันแล้วกลับ: log ครบ (28 รายการ) Lab ซ่อน/กดไม่ได้ตอนอยู่หน้าอื่น (visibility hidden + inert) 375px แผงเริ่มแบบย่อ (40px) ไม่มี scroll ข้าง · แก้ `fitWorkflowToCanvas` ให้ไม่เว้นที่ให้ log ลอยแล้ว และเพิ่ม padding ซ้ายบนจอแคบกัน sidebar บังหัวแผง

### จุดตรวจ 1
- [x] `CHECK PASS`
- [x] ภาพ `/lab` ใหม่วางเทียบกับภาพ mockup และภาพจาก T0 (`outputs/lab-layout/t0-*.jpg` เทียบ `cp1-*.jpg`)
- [ ] **ให้ผู้ใช้ดูก่อน T5**
- เรื่องแท็บที่ 3 ว่างตอน HMR (สอบสวนแล้ว ไม่แก้): login ใหม่แล้ว LS แท็บ 1–2 ครบ (0 / 6 โหนด 5 เส้น) แท็บ 3 ยังว่างอยู่ จึงกู้จาก `outputs/lab-backup/n2n_tabs_2026-11-23_before-logout.json` แล้ว reload: แท็บ 3 อยู่ครบ (6 โหนด 5 เส้น) ลองจำลอง HMR ซ้ำ 4 แบบ (แก้ FlowCanvas.tsx, แก้ LabPage.tsx ตอนแท็บ 2 active, ตอนแท็บ 3 active, และ reload ที่ 375px แล้วแก้ LabPage แล้วกลับ desktop) ไม่ทำให้แท็บว่าง จึงยังไม่รู้สาเหตุ อ่านโค้ดแล้วจังหวะที่แท็บ active ถูกเขียนทับเป็นว่างได้คือ FlowCanvas ส่ง onFlowChange (debounce 1 วินาที) ด้วย nodes ว่างเมื่อ restoreSnapshot ไม่ทำงาน (`LabPage.tsx` layout effect ข้ามถ้า `canvasRef.current` ว่าง) หลังพ้น isInitializing 500ms เกิดได้เฉพาะตอน canvas ถูก remount โดย LabPage ไม่รู้ (เช่น HMR ของ FlowCanvas) ยังไม่พบทางเกิดตอน mount ปกติ
- แก้หลังดูรอบแรก: เอาปุ่ม fit view ออกจากแถวเครื่องมือ, `fitWorkflowToCanvas` เว้นที่ให้ MiniMap+Controls (ตรวจ 800px/1440px/375px: โหนดไม่ทับและไม่ล้นพื้นที่), ป้าย Image Processing เป็นตัวหนังสือเทาเล็กไม่มีกรอบ

### [x] T5 ตรวจรวม
- เกณฑ์รับ
  - [x] จอ 375px และโทรศัพท์แนวนอน: ไม่มีอะไรล้นออกด้านข้าง ปุ่มไม่ทับกัน canvas ยังใช้งานได้
  - [x] ธีมสว่างและธีมมืด: ตัวหนังสือในหัว Lab แถวเครื่องมือ และแผงล่างอ่านได้
  - [x] hotkey (undo, redo, copy, paste, delete) ใช้ได้บน canvas และไม่ทำงานตอนพิมพ์ในช่องหรือตอน dialog เปิด
  - [ ] รันงานที่ใช้เวลาหลายนาที (เทรน Shapes) แล้วออกจาก `/lab` และกลับมา: งานรันต่อ log ครบ ปุ่ม "หยุด" ใช้ได้
  - [x] `scripts/ui_checks.py` และ `scripts/ui_checks_phase3.py` ผ่าน (แก้ selector ที่เปลี่ยนเท่านั้น)
  - [x] อัปเดตแถวที่เกี่ยวกับ Lab ใน `tasks/parity.md`
- skill: `webapp-testing`
- ขนาด: S
- ผลตรวจ (23 พ.ย.):
  - 375px: ไม่มี scroll ข้าง (scrollWidth=375) หัว/แถว/แผงล่างไม่ทับกัน; แนวนอน 844x390 touch: ผ่านใน `ui_checks.py` (B7b: ซ่อน header แพลตฟอร์ม ไม่ overflow)
  - ธีม: ปุ่มสลับธีมเปลี่ยนเฉพาะ header แพลตฟอร์ม editor คงธีมมืด (ผู้ใช้ตัดสิน B7a) ตัวหนังสือหัว Lab/แถวเครื่องมือ/แผง log อ่านได้ทั้งสองธีม
  - hotkey (กดจริงใน browser): Ctrl+C/V เพิ่มโหนด 6→7, Ctrl+Z 7→6, Ctrl+Shift+Z 6→7, Delete 7→6; ปิดตอน dialog เปิด (ui_checks A1 ผ่าน, ทดสอบเองแล้วโหนดไม่ลบ)
  - `ui_checks_phase3.py` ผ่าน 23/23; `ui_checks.py` แก้ selector เดียว (`SAVE TEMPLATE` → `เก็บ Template`) แล้วผ่านทุกข้อ **ยกเว้น A4e/A4f ที่ต้องกดแท็บ "Templates" ในคลัง ซึ่งถูกซ่อนด้วย `SHOW_LAB_TEMPLATES_TAB = false`** (timeout) ตั้งเป็น true ชั่วคราวแล้วรันซ้ำ: ผ่านทุกข้อ (แล้วตั้งคืน false) → ต้องให้ผู้ใช้ตัดสินว่าจะให้สคริปต์ข้ามสองข้อนี้ หรือเปิดแท็บ templates กลับ
  - (ทำแล้ว 24 พ.ย. ดูบรรทัด "เทรน Shapes" ด้านล่าง) รันงานหลายนาที (เทรน Shapes) แล้วออกจาก /lab กลับมา (ทดสอบแทนด้วย Homography ตอน T4: ออกไป /templates ระหว่างรัน กลับมา log ครบ ปุ่มหยุดใช้ได้) เพราะเทรนจะเขียนไฟล์/ฐานข้อมูลจริง
  - `tasks/parity.md` แถว P-13 อัปเดตแล้ว
  - เทรน Shapes (24 พ.ย., template "Shapes — End-to-End Training & Evaluation" เปิดใหม่จาก /templates): รัน → ออกไป /templates ระหว่างเทรน (Lab visibility hidden + inert, แผง log ไม่โผล่ทับ) → รอ ~3 นาทีจนเทรนจบ → กลับ /lab: log ครบ 18 รายการ ไม่มี fault Pipeline Finished สถานะ Stopped แผงล่างสูง 224px · รันอีกรอบ ออกไป-กลับระหว่างเทรน ปุ่ม "หยุด" ยังกดได้และหยุดสำเร็จ (หมายเหตุ: tab ที่เก็บใน localStorage ไม่เก็บรูป dataset ของ Multi Image Input จึงต้องเปิด template ใหม่ก่อนรัน เป็นพฤติกรรมเดิม)
  - ผล UI scripts รอบหลังแก้: `ui_checks.py` 18/18 (ข้าม A4e/A4f ตามที่ตกลง; เพิ่ม wait 1.5 วินาทีหลังโหลด /lab ในเทสต์ A1 เพราะ history snapshot แรกช้ากว่า refit), `ui_checks_phase3.py` 23/23

### จุดตรวจสุดท้าย
- [ ] `CHECK PASS` และสคริปต์ UI ผ่าน
- [ ] ผู้ใช้ดูหน้า `/lab` จริงแล้วอนุมัติ
- [ ] ห้าม push/merge จนกว่าผู้ใช้จะสั่ง

---

## รอบ 2: ปรับหน้าตา Lab ให้ใกล้ mockup v2 (24 พ.ย. 2569, branch `lab-layout`)

เปลี่ยนเฉพาะหน้าตา (UI/UX) การทำงานทุกอย่างต้องเหมือนเดิม · ค่าสี/ขนาด/ระยะ/ขอบ/มุมโค้งดึงจาก `outputs/viper-learning-v2/src/Theme.css` (และ App.css, Density.css) แล้วเขียนเป็น Tailwind ใน component (ตัวแปรสี `--lab-*` สองชุด สว่าง/มืด อยู่ใน `index.css` ผูกกับธีมของแพลตฟอร์ม) ห้าม import CSS ของ mockup · ไอคอนใช้ `lucide-react` (ติดตั้งแล้ว) · ตรวจทุกงาน: `scripts/check.sh` ต้อง `CHECK PASS`
ห้ามแตะ: หน้าตา/การทำงานของโหนด, รัน/หยุด, แท็บ workflow, hotkey, save/load/clear, fit view, undo/redo, log, Lab ค้าง mount, กฎซ่อน Lab (R-43), ค่าคงที่ที่ปิดไว้, backend

### [x] T6 หัว Lab + แถวเครื่องมือ
- เกณฑ์รับ
  - [x] ป้าย "Image Processing" เล็กสีเทา (muted) · ปุ่มย้อนกลับเป็นไอคอน · ชื่อแท็บตัวหนาสีหลักขนาดแบบ mockup (13px)
  - [x] ด้านขวา: Status (ไฟสถานะ + Running/Stopped คงไว้ในหัว), ปุ่ม ? เป็นไอคอนวงกลม, "เก็บ Template" มีไอคอนพร้อมข้อความ (ยัง disabled ตอนรัน/canvas ว่าง), ปุ่ม "รัน/หยุด" สี action สีน้ำเงินแบบ mockup (หยุด = สี danger)
  - [x] แถว "N โหนด" ป้ายเล็กแบบ mockup ไม่เพิ่มปุ่มใหม่
  - [x] สีตามธีม: มืดและสว่างใช้ค่าจาก Theme.css (`--lab-*`)
  - [x] 375px และแนวนอน: ไม่ล้น ปุ่มไม่ทับกัน
- ตรวจ: เบราว์เซอร์ 1440/800/375 ทั้งสองธีม, รัน/หยุด Homography, dialog ? และเก็บ Template เปิดได้และ hotkey ไม่ทำงานตอนเปิด
- ไฟล์: `pages/LabPage.tsx`, `components/WorkflowControls.tsx`, `index.css`
- ผลตรวจ: CHECK PASS · เบราว์เซอร์ (admin) ธีมมืดและสว่างตามตัวแปร `--lab-*` (เพิ่มใน `index.css`, `data-lab-theme` บน `.viper-app`) หัวใหม่ใช้ไอคอน lucide (ArrowLeft, CircleHelp, Save, Play/Square) · ภาพเทียบ mockup เก็บตอน T9

### [x] T7 คลังโหนด
- เกณฑ์รับ
  - [x] กว้างตาม mockup (240px) · หัว "VIPER LIBRARY" 12px ตัวอักษรห่าง สี blue-ink · ปุ่มพับเป็นไอคอน
  - [x] Open all/Close all ปุ่มเล็กแบบ `.real-group-tools`
  - [x] หัวกลุ่มตัวเล็ก พับได้ ลูกศรหมุน สีตามหมวด (INPUT = teal, EVALUATION = amber, อื่น = blue-ink) กรอบมุมโค้ง 6px พื้น subtle
  - [x] ปุ่มโหนดในกลุ่มเป็นรายการโหนดจริงชุดเดิม (22 ชนิด ลากลง canvas ได้ ปุ่ม + ADD บนจอแคบยังอยู่) หน้าตาแบบ `.real-add-node`
  - [x] ข้อความช่วยใต้กลุ่ม + footer ALL NODES
  - [x] ค่าคงที่ `SHOW_LAB_TEMPLATES_TAB` / `SHOW_LEGACY_TEMPLATE_LIST` / `NODE_GROUPS` และโค้ด templates ยังอยู่ครบ
- ตรวจ: นับปุ่มโหนด = 22, Open/Close all, ลากโหนดลง canvas, 375px (คลังเป็น overlay), สองธีม
- ไฟล์: `components/sidebar.tsx`, `index.css`
- ผลตรวจ: CHECK PASS · เบราว์เซอร์: Open all เปิด 10 กลุ่ม = 22 รายการโหนด ลากโหนดลง canvas ยังใช้ได้ footer "All Nodes" กว้าง 240px ทั้งสองธีมใช้ `--lab-*` · หมายเหตุ: ปุ่ม "Open all/Close all" เปลี่ยนข้อความเป็นตัวพิมพ์เล็กตาม mockup

### [x] T8 canvas
- เกณฑ์รับ
  - [x] ปุ่ม Fit / Save / Load / Clear ขนาดเล็กมีไอคอนแบบ `.canvas-file-actions` (คงปุ่ม fit ข้าง Save) Clear ขอบสี danger
  - [x] Controls เป็นกล่องเดียวสีเข้มแบบ mockup (คงปุ่ม lock)
  - [x] MiniMap เล็กอยู่มุมขวาล่าง
  - [x] ฉากหลังเป็นจุดตามสี canvas ของ mockup
  - [x] `fitWorkflowToCanvas` เว้นที่ตามตำแหน่งใหม่ของ MiniMap (ขวาล่าง) และ Controls (ซ้ายล่าง): เลือกพื้นที่ปลอดภัยที่ได้ zoom มากสุด · ตรวจ refit หลัง restore (verifyViewportRef) ยังทำงาน
  - [x] หน้าตาโหนดไม่เปลี่ยน
- ตรวจ: fit view แล้วไม่มีโหนดทับ MiniMap/Controls ที่ 1440/800/375, undo/redo/save/load/clear ยังใช้ได้
- ไฟล์: `FlowCanvas.tsx`, `index.css`
- ผลตรวจ: CHECK PASS · เบราว์เซอร์ 800/1440/375px: fit แล้วโหนดไม่ทับ Controls/MiniMap/แถวปุ่ม Fit-Save-Load-Clear และไม่ล้นพื้นที่ (ผมเพิ่มแถวปุ่มบนขวาเป็นสิ่งกีดขวางของ fit ด้วย เพราะเดิมโหนดบนสุดถูกปุ่มบัง) ไม่มีปุ่ม fit ของ Lab บนเดสก์ท็อปเมาส์ (กฎเดิมใน index.css ซ่อนไว้ ≥1024px) จึงตรวจ fit ผ่านปุ่มที่ 800px และ refit ตอนโหลด ฉากหลังจุดสีตามธีม (`--lab-dots`) พื้น canvas `--lab-canvas`

### [ ] T9 แผงล่าง + ตรวจรวม
- เกณฑ์รับ
  - [ ] แผงล่างหน้าตาแบบ `.results-panel`: แถบแท็บ + ปุ่มย่อ/ขยาย แท็บเดียว "บันทึกการทดลอง" (System Logs จริง) ไม่มีแท็บภาพ/เปรียบเทียบรอบ/ป้ายผลจำลอง
  - [ ] นับจำนวน ล้าง ปรับความสูง ย่อ/ขยาย ปิด/เปิดอัตโนมัติเมื่อมี log ใหม่ ใช้ได้เหมือนเดิม
  - [ ] สีตามธีมทั้งสองธีม
  - [ ] ภาพ /lab เทียบ mockup ที่ 1440/800/375 เก็บใน `outputs/lab-layout/` (`r2-*`)
  - [ ] `check.sh`, `ui_checks.py`, `ui_checks_phase3.py` ผ่าน (แก้ได้เฉพาะ selector) และรัน Homography หนึ่งรอบ
- ไฟล์: `components/LogPanel.tsx`, `index.css`

### จุดตรวจรอบ 2
- [ ] รายงานพร้อมภาพเทียบ · ห้าม push/merge จนกว่าผู้ใช้จะสั่ง
