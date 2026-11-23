# แผน: ปรับหน้าตา VIPER Lab ตาม mockup v2

สร้าง 23 พ.ย. 2569 · แผนเดิม (นำ mockup เข้าแอปจริง T1–T25) ย้ายไปที่ `tasks/archive/mockup-integration/`

## เป้าหมาย
ปรับโครงหน้า `/lab` ให้คล้าย Lab ของ mockup (`outputs/viper-learning-v2/src/App.jsx` ฟังก์ชัน `Lab`) โดยแตะแค่กรอบรอบ canvas ไม่แตะของที่ใช้งานจริงข้างใน

**เปลี่ยนตาม mockup**
- **หัว Lab:** ด้านซ้ายเป็นป้าย "Image Processing" ปุ่มย้อนกลับ และชื่อแท็บที่เปิดอยู่ ด้านขวาเป็นปุ่ม ? ปุ่ม "เก็บ Template" และปุ่มสลับ "รัน/หยุด"
- **แถบเครื่องมือเหนือ canvas:** จำนวนโหนดและปุ่ม fit view
- **กรอบคลังโหนด:** ปุ่ม Open all / Close all, กลุ่มที่พับได้ และ footer "ALL NODES"
- **System Logs:** ย้ายจากหน้าต่างลอยลงไปเป็นแผงด้านล่าง canvas ที่ยืดหดได้

**คงไว้แบบเดิม (ผู้ใช้เลือก 23 พ.ย.)**
- แถว Status (ไฟสถานะกับข้อความ Running/Stopped) โดยย้ายปุ่ม Start/Stop ขึ้นไปที่หัว Lab
- แถบแท็บ workflow (`WorkflowTabs`)
- ปุ่มโหนดสีเขียวน้ำทะเลในคลัง (ภาพ 5)
- ปุ่ม Controls และ MiniMap ของ React Flow (ภาพ 6)
- หน้าตาและการทำงานของทุกโหนด (ภาพ 7)
- ปุ่ม SAVE, LOAD และ CLEAR บน canvas

## การตัดสินใจ
1. **ปุ่ม Start/Stop ย้ายขึ้นหัว Lab เป็นปุ่มเดียว "รัน/หยุด":** ใช้ `handleStart` และ `handleStop` เดิม แถว Status แสดงแค่สถานะ
2. **ปุ่ม TEMPLATES ในคลังถูกซ่อน ไม่ได้ลบ:** ผู้ใช้เลือกเก็บแถบแท็บ workflow แทน วิธีซ่อนใช้ค่าคงที่ `SHOW_LAB_TEMPLATES_TAB = false` แบบเดียวกับ `SHOW_LEGACY_TEMPLATE_LIST` โค้ดของ `TemplatePlatformLibrary`, เมนูคลิกขวา และ About Algorithm ยังอยู่ครบ เปิดกลับได้ด้วยค่าเดียว ระหว่างที่ซ่อน template ยังเปิดใน Lab ได้จากหน้า `/templates` ด้วยปุ่ม "เปิดใน Lab"
3. **System Logs มีแท็บเดียวที่เป็น log จริง:** ไม่ทำแท็บ "ภาพและผลลัพธ์" และ "เปรียบเทียบรอบ" ของ mockup เพราะเป็นผลจำลอง ผลของแต่ละโหนดยังแสดงในตัวโหนดเหมือนเดิม
4. **ไม่ทำปุ่มดาวน์โหลด JSON ในแถบเครื่องมือ:** ซ้ำกับปุ่ม SAVE ที่มีอยู่แล้ว
5. **ความสูงของแผง log ไม่ถูกจำ:** reload แล้วจะกลับเป็นค่าเริ่มต้น
6. **CSS ใช้ Tailwind แบบที่ LabPage ใช้อยู่:** ไม่ดึง CSS `.lab-*` ของ mockup มาใช้

## ไฟล์ที่เกี่ยวข้อง
- `my-react-flow-app/src/pages/LabPage.tsx`: หัว Lab (บรรทัด 350–380) และการเรียก `WorkflowControls`, `WorkflowTabs`, `Sidebar`, `FlowCanvas`
- `my-react-flow-app/src/components/WorkflowControls.tsx`: แถว Status และปุ่ม Start/Stop
- `my-react-flow-app/src/components/sidebar.tsx`: คลังโหนด, ปุ่ม NODES/TEMPLATES, `SHOW_LEGACY_TEMPLATE_LIST`
- `my-react-flow-app/src/FlowCanvas.tsx`: canvas, SAVE/LOAD/CLEAR, Controls/MiniMap, `LogPanel` และ `fitWorkflowToCanvas` ซึ่งเว้นที่ให้ `.viper-log-panel` (บรรทัด 302–304)
- `my-react-flow-app/src/components/LogPanel.tsx`: หน้าต่าง log ที่ลอยอยู่ (`absolute`)
- `my-react-flow-app/src/index.css`: style ของ `.viper-log-panel` และกฎซ่อน Lab ตอนอยู่หน้าอื่น (R-43)
- `scripts/ui_checks.py`, `scripts/ui_checks_phase3.py`: อาจอ้างถึงปุ่ม Start/Stop หรือ log panel

## ลำดับงาน
```
T1 หัว Lab + Status ──┐
T2 แถบเครื่องมือ canvas ─┤ (อิสระต่อกัน แต่ T1 กับ T2 แก้ LabPage.tsx ทั้งคู่ จึงทำต่อกัน)
T3 กรอบคลังโหนด ───────┤
T4 System Logs ล่าง ────┘
            └── T5 ตรวจรวม (375px, ธีม, hotkey, รันงานนาน, สคริปต์ UI)
```

## ความเสี่ยง
- **fit view:** `fitWorkflowToCanvas` คำนวณพื้นที่โดยเว้นที่ให้ log panel ที่ลอยอยู่ ถ้าย้าย log ลงด้านล่าง ต้องแก้การคำนวณ ไม่อย่างนั้นโหนดจะถูกบังหรือเว้นที่ผิด
- **จอแคบ:** ตอน T24 จอ 375px กับโทรศัพท์แนวนอนผ่านแล้ว ถ้าเพิ่มทั้งหัวใหม่และแผงล่าง พื้นที่ canvas จะเหลือน้อยลง บนจอแคบ (`isCompactMobile`) ให้แผงล่างเริ่มแบบย่อไว้
- **Lab ที่ซ่อนอยู่ (R-43):** แผงล่างต้องซ่อนตามกฎเดิมตอนอยู่หน้าอื่น และต้องกดไม่ได้
- **hotkey:** dialog ที่เปิดจากหัวใหม่ต้องปิด hotkey ของ canvas แบบเดิม (`active && !saveTemplateOpen && !helpOpen`)

## ข้อห้าม (เหมือนแผนเดิม)
- ห้ามลบโหนด template หรือความสามารถใด รวมถึงตัวที่ปิดไว้ด้วยค่าคงที่ ห้ามล้างคอมเมนต์หรือเทสต์ที่ไม่เกี่ยวกับงาน
- ห้าม push และห้าม merge โดยไม่ได้รับคำสั่ง
- ทำงานบน branch `lab-layout` ที่แตกจาก `main`
