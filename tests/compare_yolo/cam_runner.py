"""Standalone YOLO CAM implementation, with SIDA's raw-detection target approach.

No imports from VIPER or SIDA. Defaults are supplied by settings.yaml so the
experiment can use the same processing choices as VIPER.
"""
from __future__ import annotations

import cv2
import numpy as np
import torch
from PIL import Image
from pytorch_grad_cam import EigenCAM, GradCAM, GradCAMPlusPlus, LayerCAM
from pytorch_grad_cam.utils.image import show_cam_on_image
from ultralytics import YOLO

try:
    from ultralytics.utils.nms import non_max_suppression
except ImportError:  # Earlier Ultralytics 8.3 releases
    from ultralytics.utils.ops import non_max_suppression

METHODS = {"GradCAM": GradCAM, "GradCAMPlusPlus": GradCAMPlusPlus,
           "EigenCAM": EigenCAM, "LayerCAM": LayerCAM}


def padded_rgb(path, size):
    image = cv2.imread(str(path))
    if image is None:
        raise ValueError(f"Cannot decode image: {path}")
    height, width = image.shape[:2]
    scale = min(size / height, size / width)
    scaled_width, scaled_height = round(width * scale), round(height * scale)
    dx = ((size - scaled_width) % 32) / 2
    dy = ((size - scaled_height) % 32) / 2
    if (width, height) != (scaled_width, scaled_height):
        image = cv2.resize(image, (scaled_width, scaled_height), interpolation=cv2.INTER_LINEAR)
    image = cv2.copyMakeBorder(image, round(dy - 0.1), round(dy + 0.1),
                              round(dx - 0.1), round(dx + 0.1),
                              cv2.BORDER_CONSTANT, value=(114, 114, 114))
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255


class DetectionHooks:
    """Expose sorted raw class/box responses to pytorch-grad-cam."""
    def __init__(self, model, layers):
        self.model = model
        self.activations, self.gradients, self.handles = [], [], []
        for layer in layers:
            self.handles.append(layer.register_forward_hook(self.capture))

    def capture(self, _module, _inputs, output):
        if not isinstance(output, torch.Tensor) or output.ndim != 4:
            raise ValueError("CAM target layers must output BCHW feature tensors; choose a layer before Detect")
        self.activations.append(output.detach().cpu())
        if output.requires_grad:
            def save(gradient):
                self.gradients.insert(0, gradient.detach().cpu())
            output.register_hook(save)

    def __call__(self, tensor):
        self.activations, self.gradients = [], []
        prediction = self.model(tensor)[0]
        if prediction.ndim != 3 or prediction.shape[1] <= 4:
            raise ValueError("Expected a YOLO detection model with raw [batch, 4+classes, anchors] output")
        rows = prediction[0].transpose(0, 1)
        scores = rows[:, 4:]
        order = scores.max(dim=1).values.argsort(descending=True)
        return [[scores[order], rows[order, :4]]]

    def release(self):
        for handle in self.handles:
            handle.remove()
        self.handles.clear()


class DetectionTarget:
    def __init__(self, options):
        self.options = options

    def __call__(self, response):
        scores, boxes = response
        count = min(len(scores), max(1, int(len(scores) * self.options["ratio"])))
        chosen = []
        for index in range(count):
            score, class_id = scores[index].max(dim=0)
            if score.detach().item() < self.options["confidence"]:
                break
            classes = self.options.get("class_ids")
            if classes and class_id.item() not in classes:
                continue
            output_type = self.options["target_output_type"]
            if output_type in ("class", "all"):
                chosen.append(score)
            if output_type in ("box", "all"):
                chosen.extend(boxes[index].unbind())
        # VIPER uses the strongest raw response if none meets the target filter.
        return sum(chosen) if chosen else (scores.max() if scores.numel() else scores.sum())


def save_cam(weights, image, method_name, options, output_dir, stem):
    device = options.get("device")
    if device is None:
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
    if isinstance(device, int) or str(device).isdigit():
        device = f"cuda:{device}"
    yolo = YOLO(str(weights))
    model = yolo.model.to(torch.device(device)).eval()
    for parameter in model.parameters():
        parameter.requires_grad_(True)
    indices = options.get("target_layers") or [max(0, len(model.model) - 2)]
    if any(not -len(model.model) <= index < len(model.model) for index in indices):
        raise ValueError(f"Invalid target layers {indices}: model has {len(model.model)} layers")
    print(f"  {method_name}: layers={indices}, device={device}", flush=True)
    layers = [model.model[index] for index in indices]
    cam = METHODS[method_name](model=model, target_layers=layers)
    # Release the library's default hooks before installing the YOLO adapter.
    cam.activations_and_grads.release()
    cam.activations_and_grads = DetectionHooks(model, layers)
    try:
        rgb = padded_rgb(image, options["image_size"])
        tensor = torch.from_numpy(rgb.transpose(2, 0, 1).copy()).unsqueeze(0).to(device)
        heatmap = cam(tensor, targets=[DetectionTarget(options)])[0]
        heatmap = np.nan_to_num(heatmap).clip(0, None)
        overlay = show_cam_on_image(rgb, heatmap, use_rgb=True)
        with torch.no_grad():
            boxes = non_max_suppression(model(tensor)[0], conf_thres=options["confidence"],
                                        iou_thres=options["iou"])[0]
        colors = np.random.default_rng(options["color_seed"]).integers(
            0, 256, size=(len(yolo.names), 3), dtype=np.uint8)
        if options["show_boxes"]:
            for row in boxes.detach().cpu().tolist():
                x1, y1, x2, y2 = map(int, row[:4])
                class_id = int(row[5])
                if options.get("class_ids") and class_id not in options["class_ids"]:
                    continue
                color = tuple(int(value) for value in colors[class_id])
                cv2.rectangle(overlay, (x1, y1), (x2, y2), color, 2)
                cv2.putText(overlay, f"{yolo.names[class_id]} {row[4]:.2f}",
                            (x1, max(15, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX,
                            0.7, color, 2, lineType=cv2.LINE_AA)
        output_dir.mkdir(parents=True, exist_ok=True)
        Image.fromarray(overlay).save(output_dir / f"{stem}_overlay.jpg")
        maximum = float(heatmap.max()) if heatmap.size else 0
        if maximum > 0:
            heatmap = heatmap / maximum
        Image.fromarray((heatmap * 255).astype(np.uint8)).save(output_dir / f"{stem}_heatmap.png")
    finally:
        cam.activations_and_grads.release()
