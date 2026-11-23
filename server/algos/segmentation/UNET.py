# server/algos/segmentation/UNEt.py
import os
import sys
import json
import uuid
import torch
import torch.nn as nn
import numpy as np
from PIL import Image
from torchvision.transforms import ToTensor


# ============================================================
# U-NET (Segmentation)
# ============================================================

class DoubleConv(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1),
            nn.ReLU(inplace=True)
        )

    def forward(self, x):
        return self.net(x)


class UNet(nn.Module):
    def __init__(self, in_ch=3, out_ch=1, features=[64, 128, 256, 512]):
        super().__init__()

        self.downs = nn.ModuleList()
        self.ups = nn.ModuleList()
        self.pool = nn.MaxPool2d(2, 2)

        # Encoder
        ch = in_ch
        for f in features:
            self.downs.append(DoubleConv(ch, f))
            ch = f

        # Bottleneck
        self.bottleneck = DoubleConv(features[-1], features[-1] * 2)

        # Decoder
        rev = features[::-1]
        ch = features[-1] * 2
        for f in rev:
            self.ups.append(nn.ConvTranspose2d(ch, f, 2, 2))
            self.ups.append(DoubleConv(ch, f))
            ch = f

        self.final = nn.Conv2d(features[0], out_ch, 1)

    def forward(self, x):
        skips = []

        for down in self.downs:
            x = down(x)
            skips.append(x)
            x = self.pool(x)

        x = self.bottleneck(x)
        skips = skips[::-1]

        for i in range(0, len(self.ups), 2):
            x = self.ups[i](x)
            skip = skips[i // 2]

            if x.shape != skip.shape:
                x = torch.nn.functional.interpolate(x, size=skip.shape[2:])

            x = torch.cat([skip, x], dim=1)
            x = self.ups[i + 1](x)

        return self.final(x)


# ============================================================
# Adapter
# ============================================================

def run(image_path: str, out_root: str = ".", model_path: str = None, threshold=0.5, **params):

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = UNet().to(device)
    if model_path:
        # F1: a state_dict needs only tensors; weights_only=True refuses pickled code in an uploaded .pt
        model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))

    model.eval()

    # Load image
    img = Image.open(image_path).convert("RGB")
    img_tensor = ToTensor()(img).unsqueeze(0).to(device)

    # Predict mask
    with torch.no_grad():
        logits = model(img_tensor)
        mask = torch.sigmoid(logits)[0, 0]

    mask_bin = (mask > threshold).float()

    # Apply mask
    img_np = img_tensor[0].cpu().numpy().transpose(1, 2, 0)
    mask_np = mask_bin.cpu().numpy()
    segmented = img_np * mask_np[..., None]

    segmented = (segmented * 255).astype(np.uint8)
    mask_img = (mask_np * 255).astype(np.uint8)

    # JSON payload
    payload = {
        "tool": "UNet_Segmentation",
        "tool_version": {
            "torch": torch.__version__,
            "python": sys.version.split()[0]
        },
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "original_shape": list(img.size[::-1]),
            "mask_shape": list(mask_img.shape),
            "segmented_shape": list(segmented.shape)
        },
        # ✅✅ เพิ่มส่วนนี้ครับ ✅✅
        "unet_parameters_used": {
            "model_path": model_path,
            "threshold": threshold
        }
    }

    # Paths
    base = os.path.splitext(os.path.basename(image_path))[0]
    uid = uuid.uuid4().hex[:8]
    stem = f"{base}_unet_seg_{uid}"

    out_root_abs = os.path.abspath(out_root or ".")
    algo_dir = os.path.join(out_root_abs, "features", "unet_segmentation")
    os.makedirs(algo_dir, exist_ok=True)

    json_path = os.path.join(algo_dir, stem + ".json")
    with open(json_path, "w") as f:
        json.dump(payload, f, indent=4)

    mask_path = os.path.join(algo_dir, stem + "_mask.png")
    Image.fromarray(mask_img).save(mask_path)

    vis_path = os.path.join(algo_dir, stem + "_segmented.jpg")
    Image.fromarray(segmented).save(vis_path)

    return os.path.abspath(json_path), os.path.abspath(mask_path), os.path.abspath(vis_path)


# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":
    j, m, v = run("your_image.jpg", "./unet_seg_output", model_path="unet_seg.pth")
    print("JSON:", j)
    print("Mask:", m)
    print("Segmented:", v)