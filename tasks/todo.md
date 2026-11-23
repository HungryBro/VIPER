# todo: ปรับหน้าตา VIPER Lab ตาม mockup v2

ตรวจทุกงาน: `scripts/check.sh` ต้องได้ `CHECK PASS` · อ้างอิงภาพ mockup: เปิด `outputs/viper-learning-platform-v2.html` หน้า Lab
skill ที่ใช้ทุกงาน: `agent-skills:incremental-implementation`, `agent-skills:frontend-ui-engineering`, `anthropic-skills:built-in-browser`

### [ ] T0 เตรียม
- [ ] สร้าง branch `lab-layout` จาก `main` ล่าสุด
- [ ] ถ่ายภาพ `/lab` ปัจจุบันไว้เทียบ ทั้งเดสก์ท็อปและ 375px (เก็บใน `outputs/`)
- ขนาด: XS

### [ ] T1 หัว Lab แบบ mockup และย้ายปุ่มรัน
- เกณฑ์รับ
  - [ ] ด้านซ้ายเป็นป้าย "Image Processing" ปุ่มย้อนกลับ (ไป `/`) และชื่อแท็บที่เปิดอยู่ ชื่อเปลี่ยนตามแท็บและตอน rename
  - [ ] ด้านขวาเป็นปุ่ม ? (`LabHelpDialog` เดิม), "เก็บ Template" (`SaveTemplateDialog` เดิม) และปุ่มสลับ "รัน/หยุด" ที่เรียก `handleStart`/`handleStop` เดิม
  - [ ] "เก็บ Template" กดไม่ได้ระหว่างรันหรือตอน canvas ว่าง
  - [ ] ปุ่มเมนูแพลตฟอร์มบนจอแคบ (`platformMenu`) ยังอยู่และใช้ได้
  - [ ] แถว Status แสดงไฟสถานะกับ Running/Stopped เท่านั้น ไม่มีปุ่ม Start/Stop แล้ว
  - [ ] ปุ่ม "รัน" ตอน canvas ว่างยังเตือนแบบเดิม
- ตรวจ: เบราว์เซอร์ รัน Homography ด้วยปุ่มใหม่แล้วกดหยุดกลางทาง ลอง ? และเก็บ Template แล้วดูว่า hotkey ไม่ไปลบโหนดระหว่างที่ dialog เปิด
- ไฟล์: `pages/LabPage.tsx`, `components/WorkflowControls.tsx`, สคริปต์ UI ถ้าอ้างปุ่ม Start/Stop
- ขนาด: S

### [ ] T2 แถบเครื่องมือเหนือ canvas
- เกณฑ์รับ
  - [ ] แถวใต้แถบแท็บแสดงป้าย "N โหนด" ที่ตรงกับจำนวนโหนดบน canvas และอัปเดตตอนเพิ่มหรือลบโหนด
  - [ ] ปุ่ม fit view เรียก `canvasRef.current.fitView()` เดิม
- ตรวจ: เพิ่มหรือลบโหนดแล้วดูตัวเลข กด fit view
- ไฟล์: `pages/LabPage.tsx` (ใช้ `handleFlowChange` ที่มีอยู่แล้วเพื่อรู้จำนวนโหนด)
- ขนาด: XS

### [ ] T3 กรอบคลังโหนดแบบ mockup
- เกณฑ์รับ
  - [ ] หัว "VIPER LIBRARY" มีปุ่มพับคลังเหมือนเดิม และมีปุ่ม Open all / Close all เปิดหรือปิดทุกกลุ่ม
  - [ ] แต่ละกลุ่ม (INPUT ฯลฯ) พับได้ และปุ่มโหนดยังเป็นสีเขียวน้ำทะเลแบบเดิม (ภาพ 5)
  - [ ] footer เป็น "ALL NODES"
  - [ ] ปุ่ม NODES/TEMPLATES ถูกซ่อนด้วย `SHOW_LAB_TEMPLATES_TAB = false` โค้ด templates, เมนูคลิกขวา, About Algorithm และ `SHOW_LEGACY_TEMPLATE_LIST` ยังอยู่ครบ
  - [ ] เมื่อลองตั้ง `SHOW_LAB_TEMPLATES_TAB = true` ในเบราว์เซอร์ (ไม่แก้ไฟล์จริง) แท็บ templates กลับมาใช้ได้
  - [ ] จำนวนชนิดโหนดในคลังยังเท่าเดิม (22) และกลุ่มที่ซ่อนอยู่ยังเปิดกลับได้ด้วย `enabled` ใน `NODE_GROUPS`
- ตรวจ: เบราว์เซอร์ นับปุ่มโหนด กด Open all/Close all แล้วเพิ่มโหนดจากคลัง
- ไฟล์: `components/sidebar.tsx`
- ขนาด: S

### [ ] T4 System Logs เป็นแผงด้านล่าง
- เกณฑ์รับ
  - [ ] log อยู่ในแผงด้านล่าง canvas เต็มความกว้างของ canvas ไม่ลอยทับโหนดแล้ว
  - [ ] ลากขอบบนเพื่อปรับความสูงได้ (มีค่าต่ำสุดและสูงสุด) และย่อหรือขยายได้
  - [ ] ปุ่มล้าง log และตัวนับยังใช้ได้ log ใหม่เลื่อนลงล่างสุดเหมือนเดิม
  - [ ] บนจอแคบ (`isCompactMobile`) แผงเริ่มแบบย่อ
  - [ ] `fitWorkflowToCanvas` ไม่ต้องเว้นที่ให้ log ที่ลอยอยู่แล้ว fit view แล้วไม่มีโหนดถูกแผงบัง
  - [ ] ไปหน้าอื่นระหว่างรันแล้วกลับมา: log ครบ แผงล่างไม่โผล่ทับหน้าอื่น (R-43)
- ตรวจ: รัน pipeline แล้วดู log ปรับความสูง กด fit view ไป `/templates` แล้วกลับมา
- ไฟล์: `components/LogPanel.tsx`, `FlowCanvas.tsx`, `index.css`
- ขนาด: M

### จุดตรวจ 1
- [ ] `CHECK PASS`
- [ ] ภาพ `/lab` ใหม่วางเทียบกับภาพ mockup และภาพจาก T0
- [ ] **ให้ผู้ใช้ดูก่อน T5**

### [ ] T5 ตรวจรวม
- เกณฑ์รับ
  - [ ] จอ 375px และโทรศัพท์แนวนอน: ไม่มีอะไรล้นออกด้านข้าง ปุ่มไม่ทับกัน canvas ยังใช้งานได้
  - [ ] ธีมสว่างและธีมมืด: ตัวหนังสือในหัว Lab แถวเครื่องมือ และแผงล่างอ่านได้
  - [ ] hotkey (undo, redo, copy, paste, delete) ใช้ได้บน canvas และไม่ทำงานตอนพิมพ์ในช่องหรือตอน dialog เปิด
  - [ ] รันงานที่ใช้เวลาหลายนาที (เทรน Shapes) แล้วออกจาก `/lab` และกลับมา: งานรันต่อ log ครบ ปุ่ม "หยุด" ใช้ได้
  - [ ] `scripts/ui_checks.py` และ `scripts/ui_checks_phase3.py` ผ่าน (แก้ selector ที่เปลี่ยนเท่านั้น)
  - [ ] อัปเดตแถวที่เกี่ยวกับ Lab ใน `tasks/parity.md`
- skill: `webapp-testing`
- ขนาด: S

### จุดตรวจสุดท้าย
- [ ] `CHECK PASS` และสคริปต์ UI ผ่าน
- [ ] ผู้ใช้ดูหน้า `/lab` จริงแล้วอนุมัติ
- [ ] ห้าม push/merge จนกว่าผู้ใช้จะสั่ง
