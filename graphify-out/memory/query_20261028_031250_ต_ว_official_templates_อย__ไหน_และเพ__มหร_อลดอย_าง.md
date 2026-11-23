---
type: "query"
date: "2026-10-28T03:12:50.018624+00:00"
question: "ตัว Official templates อยู่ไหน และเพิ่มหรือลดอย่างไร"
contributor: "graphify"
source_nodes: ["workflowTemplates.ts", "OFFICIAL_TEMPLATE_CATALOG", "ensure_official_template_records", "TemplatePlatformLibrary.tsx"]
---

# Q: ตัว Official templates อยู่ไหน และเพิ่มหรือลดอย่างไร

## Answer

รายการ Official แยกเป็นสองส่วน: workflow จริงอยู่ฝั่ง frontend ใน my-react-flow-app/src/lib/templates/*.ts และต้อง import กับเพิ่มเข้า TEMPLATES ใน workflowTemplates.ts; ส่วนรายชื่อและคำอธิบายที่แสดงใน Official tab อยู่ใน OFFICIAL_TEMPLATE_CATALOG ใน server/official_templates.py โดย official_key ต้องตรงกับชื่อใน TEMPLATES. Backend เติมเฉพาะ records ที่ยังไม่มีตอนเริ่มระบบหรือเรียก endpoint จึงไม่ลบ record เก่าอัตโนมัติ. การเอาออกจาก frontend อย่างเดียวจะทิ้งการ์ดที่กดโหลดแล้วหา workflow ไม่เจอ; การเอาออกจาก catalog อย่างเดียวก็ไม่ลบ DB record. ปัจจุบันไม่มี API/UI ลบ Official template; ควรเพิ่ม archive/active flag และกรอง API เพื่อซ่อนอย่างปลอดภัย เพราะ DB row เก็บ cover/comment metadata และ hard delete จะ cascade ลบ comments.

## Source Nodes

- workflowTemplates.ts
- OFFICIAL_TEMPLATE_CATALOG
- ensure_official_template_records
- TemplatePlatformLibrary.tsx