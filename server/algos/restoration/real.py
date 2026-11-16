# server/algos/restoration/real.py
import cv2
import os
import json
import numpy as np
import torch
from realesrgan import RealESRGANer
from basicsr.archs.rrdbnet_arch import RRDBNet

# หาตำแหน่งโฟลเดอร์ปัจจุบันเพื่อระบุ Path ของ Weights
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

def run(image_path, out_root, model_path=None, **kwargs):
    """
    Adapter function for Real-ESRGAN with pseudo-denoise strength control.
    """
    # 1. จัดการ Path
    if model_path is None:
        model_path = os.path.join(CURRENT_DIR, "weights", "RealESRGAN_x4plus.pth")
    
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model weights not found at: {model_path}. Please download it first.")

    output_dir = os.path.join(out_root, "restoration")
    os.makedirs(output_dir, exist_ok=True)

    # 2. ตั้งค่า Device
    if torch.cuda.is_available():
        device = "cuda"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"

    # 3. โหลด Model
    model = RRDBNet(
        num_in_ch=3, num_out_ch=3, num_feat=64,
        num_block=23, num_grow_ch=32, scale=4
    )

    # รับค่า Parameter
    scale = float(kwargs.get("scale", 4))
    denoise_strength = float(kwargs.get("denoise", 0.4))
    
    # Clip denoise ให้มั่นใจว่าอยู่ระหว่าง 0-1
    denoise_strength = max(0.0, min(1.0, denoise_strength))

    upsampler = RealESRGANer(
        scale=4, 
        model_path=model_path,
        model=model,
        tile=kwargs.get("tile", 0),
        tile_pad=10,
        pre_pad=0,
        half=(device == "cuda"),
        device=device
    )

    # 4. อ่านภาพ
    img = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Cannot load image: {image_path}")

    h, w, _ = img.shape

    # 5. ประมวลผล (Enhance)
    # outscale คือ scale ที่เราต้องการจริงๆ
    enhanced_img, _ = upsampler.enhance(img, outscale=scale)

    # 6. ✅ เพิ่ม Logic: Denoise Blending
    # ถ้า denoise_strength < 1.0 เราจะเอาภาพต้นฉบับมาผสม
    final_output = enhanced_img

    if denoise_strength < 1.0:
        # ต้องขยายภาพต้นฉบับให้ขนาดเท่ากับภาพผลลัพธ์ก่อนผสม
        h_out, w_out, _ = enhanced_img.shape
        img_resized = cv2.resize(img, (w_out, h_out), interpolation=cv2.INTER_LANCZOS4)
        
        # สูตรผสม: Result = (Enhanced * strength) + (Original * (1 - strength))
        # strength มาก = เห็นผลลัพธ์จาก AI มาก
        final_output = cv2.addWeighted(enhanced_img, denoise_strength, img_resized, 1.0 - denoise_strength, 0)

    # 7. บันทึกผลลัพธ์
    base_name = os.path.basename(image_path).split('.')[0]
    out_filename = f"{base_name}_realesrgan.png"
    output_path = os.path.join(output_dir, out_filename)
    cv2.imwrite(output_path, final_output)

    # 8. บันทึก JSON
    result_data = {
        "tool": "Real-ESRGAN",
        "parameters_used": {
            "scale": scale,
            "denoise_strength": denoise_strength
        },
        "input_resolution": [w, h],
        "output_resolution": [final_output.shape[1], final_output.shape[0]],
        "device": device,
        "output_image": output_path
    }
    
    json_path = os.path.join(output_dir, f"{base_name}_realesrgan.json")
    with open(json_path, "w") as f:
        json.dump(result_data, f, indent=4)

    return json_path, output_path