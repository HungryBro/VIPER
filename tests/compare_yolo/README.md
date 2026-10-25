# รัน Train → Detect → Grad-CAM แยกจาก VIPER

ใช้ dataset ที่ Dataset Builder ของ VIPER สร้างไว้ แล้วเทรนโมเดลใหม่เอง
นำ `best.pt` ของการทดลองนี้ไปสร้างภาพ Detect และ Grad-CAM เพื่อเปิดเทียบกับ
ภาพจาก VIPER ด้วยตัวเอง ไม่มีขั้นตอน Evaluation หรือการเทียบ JSON อัตโนมัติ

โค้ดในโฟลเดอร์นี้ใช้ Ultralytics และ pytorch-grad-cam โดยตรง ไม่ import
โค้ดจาก VIPER หรือ SIDA และไม่เรียก API ของ VIPER

## เริ่มใช้งาน

หากเปิด Terminal อยู่ใน `tests/compare_yolo` แล้ว รันได้โดยตรง:

```bash
.venv/bin/python run.py
```

หรือเปิด environment ก่อน แล้วใช้ `python run.py`:

```bash
source .venv/bin/activate
python run.py
```

หลังรันเสร็จจะเปิดหน้าต่าง Python แสดงภาพเรียงซ้ายไปขวา:
**Input → Detect → GradCAM → GradCAMPlusPlus → EigenCAM → LayerCAM**
โดยใช้ภาพ overlay ของแต่ละวิธี หากมีหลายภาพทดสอบจะแสดงคนละแถว
ปิดหน้าต่างเมื่อดูเสร็จเพื่อให้โปรแกรมจบ ภาพรวมจะบันทึกเป็น `comparison.png`
ในโฟลเดอร์ของรันนั้นด้วย ถ้าไม่ได้เลือก CAM บางวิธี ช่องนั้นจะแสดง Not selected

ตั้ง `preview.show: false` ใน setting หรือรัน `python run.py --no-show`
เพื่อบันทึกภาพรวมโดยไม่เปิดหน้าต่าง สำหรับเครื่องที่ไม่มี graphical backend
โปรแกรมจะแจ้งพาธภาพรวมให้เปิดเอง

ตรวจค่าตั้งโดยไม่เทรนใช้ `python run.py --check` หลังเปิด environment

เปิด Terminal ที่โฟลเดอร์หลัก VIPER:

```bash
cd /Users/dolphin/Desktop/VIPER
```

สำหรับเครื่องนี้มี `.venv` ใน compare_yolo เตรียมไว้แล้ว หากต้องติดตั้งใหม่:

```bash
python3 -m venv --system-site-packages tests/compare_yolo/.venv
tests/compare_yolo/.venv/bin/python -m pip install -r tests/compare_yolo/requirements.txt
```

environment นี้อ่านแพ็กเกจ ML ที่เครื่องมีอยู่แล้ว และติดตั้งแพ็กเกจที่ขาด
ภายใน compare_yolo หากต้องการแยกแพ็กเกจทั้งหมด ให้สร้าง venv โดยไม่ใส่
`--system-site-packages` แล้วติดตั้ง requirements เดียวกัน

1. แก้ `settings.yaml` ให้ตรงกับรันที่ต้องการเทียบใน VIPER
2. ตรวจพาธและ dependencies ก่อนเริ่ม:

```bash
tests/compare_yolo/.venv/bin/python tests/compare_yolo/run.py --check
```

3. รันตั้งแต่ Train จนสร้างภาพทั้งหมด:

```bash
tests/compare_yolo/.venv/bin/python tests/compare_yolo/run.py
```

รันจาก directory อื่นได้ด้วยพาธเต็ม พาธภายใน setting ที่เป็น relative
จะเริ่มจากโฟลเดอร์หลัก VIPER เสมอ ส่วน `--config` อ้างอิง directory ของ Terminal
เลือก setting อีกไฟล์ได้ด้วย `--config /path/to/experiment.yaml`

## ค่าที่ปรับใน settings.yaml

| ส่วน | ค่าที่กำหนด |
|---|---|
| ข้อมูล | `dataset_yaml`, `test_images` (ภาพได้หลายไฟล์) |
| โมเดลตั้งต้น | `base_model` เลือกไฟล์ `.pt` ใน `VIPER/models/` |
| Train | `epochs`, `image_size`, `batch`, `device`, `seed`, `deterministic`, `workers` |
| Detect | `confidence`, `iou`, `image_size`, `class_ids`, `device` |
| Grad-CAM | `methods`, `confidence`, `target_layers`, `class_ids`, `device` |
| ผลลัพธ์ | `output_dir` ต้องอยู่ในโฟลเดอร์ compare_yolo |

ดูรายการโมเดลที่เลือกได้:

```bash
tests/compare_yolo/.venv/bin/python tests/compare_yolo/run.py --list-models
```

ค่าเริ่มต้นอ้างอิงตัวอย่างที่คุยกัน: dataset `dataset_c48f2aa2`,
โมเดล `yolo11n.pt`, เทรน 10 epochs, image size 640, batch 4,
ทดสอบภาพ `multi_003.jpg`, Detect เฉพาะคลาส `[2]`, Grad-CAM ทุกคลาส
เมื่อเปลี่ยน dataset ใน VIPER ต้องเปลี่ยน `dataset_yaml` ตามด้วย
โปรแกรมจะไม่เลือก dataset ล่าสุดให้เอง และไม่แก้ setting บน Frontend

`class_ids: null` หรือ `[]` หมายถึงทุกคลาส `target_layers: null` หรือ `[]`
ใช้ feature layer สุดท้ายก่อน Detect อัตโนมัติ ค่าในรายการเขียนเป็น YAML
เช่น `[0, 2]` และ `[13, 16, 19]` โดย Grad-CAM เลือกวิธีเดียวหรือหลายวิธีได้:

```yaml
methods: [GradCAM, GradCAMPlusPlus, EigenCAM, LayerCAM]
```

มีค่าเพิ่มเติมใน Grad-CAM ให้ปรับได้ ได้แก่ image size, NMS IoU, ratio,
target output type, การวาดกรอบ และ seed สี ค่าเริ่มต้นใช้แนวทางเดียวกับ VIPER:
640, 0.8, 0.1, `class`, วาดกรอบ และ seed 7 ตามลำดับ
เมื่อกรองคลาสแล้วไม่มี response ผ่าน threshold ตัว CAM จะใช้ raw response
ที่สูงที่สุดเป็นเป้าหมายสำรอง เช่นเดียวกับ VIPER

`device: null` ของ Train/Detect ให้ Ultralytics เลือก ส่วน Grad-CAM เลือก
CUDA ถ้ามี มิฉะนั้นใช้ CPU เพื่อให้ตรงกับพฤติกรรม VIPER กำหนด `cpu`, `mps`
หรือ CUDA เช่น `"0"` เองได้ ค่า training อื่น เช่น optimizer/augmentation
ใช้ค่าเริ่มต้นของ Ultralytics เช่นเดียวกับ VIPER

## ไฟล์ผลลัพธ์

แต่ละคำสั่งสร้างรันใหม่ ไม่เขียนทับรันเดิม:

```text
outputs/run_วันเวลา_รหัส/
  comparison.png                 ภาพ Input / Detect / CAM ทั้ง 4 รวมกัน
  settings.yaml                  ค่าที่ใช้ในรันนี้
  inputs/                        สำเนาภาพ โมเดลตั้งต้น และ dataset
  train/weights/best.pt           โมเดลที่เทรนใหม่
  train/weights/last.pt
  detect/001_multi_003.jpg        ภาพ Detect
  gradcam/GradCAM/
    001_multi_003_overlay.jpg
    001_multi_003_heatmap.png
  gradcam/GradCAMPlusPlus/        ภาพ overlay และ heatmap
  gradcam/EigenCAM/
  gradcam/LayerCAM/
```

สำหรับภาพทดสอบ 1 ภาพจะได้ Detect 1 ภาพ และ CAM 8 ภาพ รวม 9 ภาพหลัก
Ultralytics ยังคงสร้าง checkpoint, log และกราฟการเทรนใน `train/` ตามปกติ
รวมถึง validation ภายใน training เพื่อเลือก `best.pt` ซึ่งเป็นขั้นตอนที่
YOLO Train ใช้อยู่ ไม่ได้รัน Evaluation node ของ VIPER

ก่อนเทรนจะคัดลอก dataset โดยรักษา train/validation split และ label เดิม
แล้วเปลี่ยนพาธ YAML ของสำเนา ไฟล์ cache และผลการเทรนจึงอยู่ฝั่งการทดลอง
ไฟล์ใน Image Input, dataset และ models ของ VIPER ใช้เป็นแหล่งอ่านเท่านั้น

หากต้องการปรับ Detect/CAM แล้วรันซ้ำโดยใช้โมเดลจากการทดลองเดิม:

```bash
tests/compare_yolo/.venv/bin/python tests/compare_yolo/run.py \
  --weights tests/compare_yolo/outputs/<ชื่อรัน>/train/weights/best.pt
```

คำสั่งนี้ข้าม Train และสร้างโฟลเดอร์ผลใหม่ ใช้ `settings.yaml` ปัจจุบัน
หาก CAM วิธีใดผิดพลาด โปรแกรมจะลองวิธีที่เหลือและแสดงข้อผิดพลาด
รหัสออก 0 หมายถึงเสร็จครบ; 2 หมายถึงค่าตั้งไม่ถูกต้องหรือบางขั้นตอนล้มเหลว

## การเปิดเทียบกับ VIPER

ตั้ง dataset, โมเดลตั้งต้น, epochs, batch, image size และภาพทดสอบให้เหมือนกัน
แล้วเปิดภาพใน `detect/` หรือ `gradcam/<method>/` คู่กับภาพจาก VIPER
ใช้ค่ากรองคลาส threshold และ target layers เดียวกันด้วย

การเทรนใหม่แยกกันอาจให้ weights และภาพต่างกันได้แม้ตั้งค่าตรงกัน
ควรใช้เวอร์ชัน Ultralytics/PyTorch, device และ seed เดียวกันในการทดลอง
โปรแกรมนี้สร้างภาพให้ตรวจด้วยตา ไม่ได้ตัดสิน MATCH/DIFFERENT ให้อัตโนมัติ
