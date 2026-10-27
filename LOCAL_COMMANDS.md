# VIPER: คำสั่งใช้งานในเครื่อง

คำสั่งด้านล่างให้รันจากโฟลเดอร์หลักของ repo:

```bash
cd /Users/dolphin/Desktop/VIPER
```

ไฟล์นี้เป็นโน้ตส่วนตัวและถูก ignore ด้วย `.gitignore` จึงไม่ถูกเพิ่มเข้า GitHub

## เริ่มระบบ

### เตรียมครั้งแรก

ถ้ายังไม่มี `.env` ให้คัดลอกจากตัวอย่างแล้วแก้ค่าตามเครื่อง:

```bash
cp .env.example .env
```

ถ้ายังไม่มี Python environment หรือแพ็กเกจ backend:

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
```

ถ้ายังไม่มีแพ็กเกจ Frontend:

```bash
cd my-react-flow-app
npm ci
cd ..
```

### เปิดฐานข้อมูล

Backend ใช้ PostgreSQL ตามค่าเริ่มต้นใน `.env.example`:

```bash
docker compose up -d postgres_db
docker compose ps
```

### เปิด Backend

เปิด Terminal หนึ่งหน้าต่างที่โฟลเดอร์หลัก VIPER:

```bash
./.venv/bin/python -m uvicorn server.main:app --reload --host 127.0.0.1 --port 8000
```

API docs: <http://127.0.0.1:8000/docs>

### เปิด Frontend

เปิดอีก Terminal หนึ่งหน้าต่าง:

```bash
cd /Users/dolphin/Desktop/VIPER/my-react-flow-app
npm run dev
```

Frontend ปกติอยู่ที่ <http://localhost:5173> กด `Ctrl+C` ในแต่ละ Terminal เพื่อหยุด server

## รันเทสต์

รันเทสต์ทั้งหมดจากโฟลเดอร์หลัก:

```bash
./.venv/bin/python -m pytest
```

รันไฟล์เดียว หรือระบุ test เพิ่มเติมได้ เช่น:

```bash
./.venv/bin/python -m pytest tests/test_auth.py
./.venv/bin/python -m pytest tests/test_yolo_adapter.py tests/test_yolo_dataset_builder.py
```

### เทสต์ในไฟล์ที่เพิ่ม

คำสั่งนี้เลือก 12 ไฟล์เทสต์ที่ถูกเพิ่มในช่วง commit ที่นำมาเทียบ:

```bash
./.venv/bin/python -m pytest \
  tests/test_admin_audit_logs.py \
  tests/test_admin_users.py \
  tests/test_auth.py \
  tests/test_classification_evaluation.py \
  tests/test_comments_api.py \
  tests/test_detection_evaluation.py \
  tests/test_detection_evaluator.py \
  tests/test_evaluation_api.py \
  tests/test_platform_models.py \
  tests/test_templates_api.py \
  tests/test_yolo_adapter.py \
  tests/test_yolo_dataset_builder.py
```

เทสต์ SURF เก่าบางตัวอาจล้มในเครื่องนี้ เพราะ OpenCV ที่ติดตั้งปิด `OPENCV_ENABLE_NONFREE`; ดู error ที่ `cv2.xfeatures2d.SURF_create` ไม่ใช่ปัญหาจากเทสต์ HungryBro 12 ไฟล์ข้างบน

## ทดลอง `compare_yolo`

โปรแกรมนี้เทรน YOLO แยกจาก Backend ของ VIPER แล้วสร้างภาพ Detect และ Grad-CAM เพื่อเปิดเทียบด้วยตา ปรับ dataset, โมเดล, ภาพทดสอบ และพารามิเตอร์ใน `tests/compare_yolo/settings.yaml` ก่อนรัน

ตรวจ config และ dependencies โดยยังไม่เริ่มเทรน:

```bash
tests/compare_yolo/.venv/bin/python tests/compare_yolo/run.py --check
```

ดูรายการโมเดล:

```bash
tests/compare_yolo/.venv/bin/python tests/compare_yolo/run.py --list-models
```

รัน Train → Detect → Grad-CAM และเปิดหน้าต่างภาพรวม:

```bash
tests/compare_yolo/.venv/bin/python tests/compare_yolo/run.py
```

บันทึกผลโดยไม่เปิดหน้าต่างภาพ:

```bash
tests/compare_yolo/.venv/bin/python tests/compare_yolo/run.py --no-show
```

รัน Detect/CAM ซ้ำโดยใช้ weights จากรอบก่อน (เปลี่ยน `<ชื่อรัน>` ให้ตรงกับโฟลเดอร์จริง):

```bash
tests/compare_yolo/.venv/bin/python tests/compare_yolo/run.py \
  --weights tests/compare_yolo/outputs/<ชื่อรัน>/train/weights/best.pt
```

ผลแต่ละรอบอยู่ใน `tests/compare_yolo/outputs/run_.../` โฟลเดอร์นี้ถูก ignore ไว้แล้ว

ถ้ายังไม่มี environment ของ compare_yolo ให้ติดตั้งครั้งเดียว:

```bash
python3 -m venv --system-site-packages tests/compare_yolo/.venv
tests/compare_yolo/.venv/bin/python -m pip install -r tests/compare_yolo/requirements.txt
```

## คำสั่ง Frontend เพิ่มเติม

รันจาก `my-react-flow-app`:

```bash
npm run lint
npm run build
```

