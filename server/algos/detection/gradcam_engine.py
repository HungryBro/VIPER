"""Grad-CAM engine for Ultralytics YOLO models.

This module is owned by VIPER and contains no project-specific datasets,
weights, or imports. It supports local ``.pt`` files and Ultralytics model
aliases such as ``yolo11n.pt``.
"""

from __future__ import annotations

import inspect
from typing import Iterable, Optional

import cv2
import numpy as np
import torch
from PIL import Image
from pytorch_grad_cam import EigenCAM, GradCAM, GradCAMPlusPlus, LayerCAM
from pytorch_grad_cam.utils.image import show_cam_on_image
from ultralytics import YOLO
from ultralytics.utils.nms import non_max_suppression


CAM_METHODS = {
    "GradCAM": GradCAM,
    "GradCAMPlusPlus": GradCAMPlusPlus,
    "EigenCAM": EigenCAM,
    "LayerCAM": LayerCAM,
}


def letterbox(
    image: np.ndarray,
    new_shape: tuple[int, int] | int = (640, 640),
    color: tuple[int, int, int] = (114, 114, 114),
    auto: bool = True,
    scale_fill: bool = False,
    scale_up: bool = True,
    stride: int = 32,
) -> np.ndarray:
    """Resize and pad an image using the same geometry as YOLO inference."""
    shape = image.shape[:2]
    if isinstance(new_shape, int):
        new_shape = (new_shape, new_shape)

    ratio = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
    if not scale_up:
        ratio = min(ratio, 1.0)

    new_unpadded = int(round(shape[1] * ratio)), int(round(shape[0] * ratio))
    width_padding = new_shape[1] - new_unpadded[0]
    height_padding = new_shape[0] - new_unpadded[1]
    if auto:
        width_padding, height_padding = (
            np.mod(width_padding, stride),
            np.mod(height_padding, stride),
        )
    elif scale_fill:
        width_padding = height_padding = 0.0
        new_unpadded = (new_shape[1], new_shape[0])

    width_padding /= 2
    height_padding /= 2
    if shape[::-1] != new_unpadded:
        image = cv2.resize(image, new_unpadded, interpolation=cv2.INTER_LINEAR)

    top = int(round(height_padding - 0.1))
    bottom = int(round(height_padding + 0.1))
    left = int(round(width_padding - 0.1))
    right = int(round(width_padding + 0.1))
    return cv2.copyMakeBorder(
        image, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color
    )


class ActivationsAndGradients:
    """Capture intermediate activations and gradients for YOLO layers."""

    def __init__(self, model: torch.nn.Module, target_layers: Iterable[torch.nn.Module]):
        self.model = model
        self.gradients: list[torch.Tensor] = []
        self.activations: list[torch.Tensor] = []
        self.handles = []
        for target_layer in target_layers:
            self.handles.append(target_layer.register_forward_hook(self.save_activation))
            self.handles.append(target_layer.register_forward_hook(self.save_gradient))

    def save_activation(self, _module, _inputs, output) -> None:
        self.activations.append(output.cpu().detach())

    def save_gradient(self, _module, _inputs, output) -> None:
        if not getattr(output, "requires_grad", False):
            return

        def store_gradient(gradient):
            self.gradients = [gradient.cpu().detach(), *self.gradients]

        output.register_hook(store_gradient)

    @staticmethod
    def post_process(result):
        class_scores = result[:, 4:]
        boxes = result[:, :4]
        _, indices = torch.sort(class_scores.max(1)[0], descending=True)
        ordered_scores = torch.transpose(class_scores[0], 0, 1)[indices[0]]
        ordered_boxes = torch.transpose(boxes[0], 0, 1)[indices[0]]
        return ordered_scores, ordered_boxes

    def __call__(self, tensor):
        self.gradients = []
        self.activations = []
        model_output = self.model(tensor)
        scores, boxes = self.post_process(model_output[0])
        return [[scores, boxes]]

    def release(self) -> None:
        for handle in self.handles:
            handle.remove()
        self.handles = []


class YOLOTarget(torch.nn.Module):
    """Select class and/or box values used as the CAM backpropagation target."""

    def __init__(
        self,
        output_type: str,
        confidence: float,
        ratio: float,
        target_class_ids: Optional[list[int]] = None,
        target_box: Optional[torch.Tensor] = None,
    ) -> None:
        super().__init__()
        self.output_type = output_type
        self.confidence = confidence
        self.ratio = ratio
        self.target_class_ids = target_class_ids
        self.target_box = target_box

    @staticmethod
    def box_iou_xywh(box, target_box):
        box_x1 = box[0] - box[2] / 2
        box_y1 = box[1] - box[3] / 2
        box_x2 = box[0] + box[2] / 2
        box_y2 = box[1] + box[3] / 2
        target_x1, target_y1, target_x2, target_y2 = target_box
        intersection = torch.clamp(
            torch.minimum(box_x2, target_x2) - torch.maximum(box_x1, target_x1),
            min=0,
        ) * torch.clamp(
            torch.minimum(box_y2, target_y2) - torch.maximum(box_y1, target_y1),
            min=0,
        )
        box_area = torch.clamp(box_x2 - box_x1, min=0) * torch.clamp(
            box_y2 - box_y1, min=0
        )
        target_area = torch.clamp(target_x2 - target_x1, min=0) * torch.clamp(
            target_y2 - target_y1, min=0
        )
        return intersection / (box_area + target_area - intersection + 1e-6)

    def forward(self, data):
        class_scores, boxes = data
        selected = []
        box_candidates = []
        candidate_count = max(1, int(class_scores.size(0) * self.ratio))
        for index in range(min(candidate_count, class_scores.size(0))):
            score = class_scores[index].max()
            if float(score.detach()) < self.confidence:
                break
            class_id = int(class_scores[index].argmax())
            if self.target_class_ids is not None and class_id not in self.target_class_ids:
                continue
            if self.target_box is not None:
                box_candidates.append((self.box_iou_xywh(boxes[index], self.target_box), index))
                continue
            if self.output_type in {"class", "all"}:
                selected.append(score)
            if self.output_type in {"box", "all"}:
                selected.extend(boxes[index, coordinate] for coordinate in range(4))

        if self.target_box is not None and box_candidates:
            _, selected_index = max(box_candidates, key=lambda item: float(item[0]))
            if self.output_type in {"class", "all"}:
                selected.append(class_scores[selected_index].max())
            if self.output_type in {"box", "all"}:
                selected.extend(boxes[selected_index, coordinate] for coordinate in range(4))

        if not selected:
            return torch.tensor(0.0, device=class_scores.device, requires_grad=True)
        return sum(selected)


class YOLOHeatmap:
    """Generate object-detection CAM overlays for YOLOv8 and YOLO11 models."""

    def __init__(
        self,
        weight: str,
        *,
        device: torch.device,
        method: str = "GradCAM",
        layers: Optional[list[int]] = None,
        confidence: float = 0.2,
        ratio: float = 0.1,
        show_boxes: bool = True,
        target_class_ids: Optional[list[int]] = None,
        target_output_type: str = "class",
    ) -> None:
        if method not in CAM_METHODS:
            raise ValueError(f"Unsupported CAM method: {method}")

        yolo_model = YOLO(weight)
        self.model = yolo_model.model.to(device)
        self.model_names = yolo_model.names
        self.device = device
        self.confidence = confidence
        self.show_boxes = show_boxes
        self.target_class_ids = target_class_ids
        for parameter in self.model.parameters():
            parameter.requires_grad_(True)
        self.model.eval()

        layer_indices = layers or [self.default_target_layer()]
        self.layer_indices = layer_indices
        layer_count = len(self.model.model)
        invalid = [index for index in layer_indices if not -layer_count <= index < layer_count]
        if invalid:
            raise ValueError(
                f"Target layer(s) {invalid} outside model layer range "
                f"{-layer_count}..{layer_count - 1}"
            )
        target_layers = [self.model.model[index] for index in layer_indices]
        self.target = YOLOTarget(
            target_output_type, confidence, ratio, target_class_ids=target_class_ids
        )
        cam_class = CAM_METHODS[method]
        cam_arguments = {"model": self.model, "target_layers": target_layers}
        if "use_cuda" in inspect.signature(cam_class.__init__).parameters:
            cam_arguments["use_cuda"] = device.type == "cuda"
        self.method = cam_class(**cam_arguments)
        self.method.activations_and_grads = ActivationsAndGradients(
            self.model, target_layers
        )
        class_count = len(self.model_names)
        random = np.random.default_rng(seed=7)
        self.colors = random.integers(0, 256, size=(class_count, 3), dtype=np.uint8)

    def default_target_layer(self) -> int:
        """Use the last feature layer before the Detect head."""
        return max(0, len(self.model.model) - 2)

    def post_process(self, result):
        return non_max_suppression(
            result, conf_thres=self.confidence, iou_thres=0.8
        )[0]

    def draw_detection(self, box, color, label: str, image: np.ndarray) -> None:
        x1, y1, x2, y2 = (int(value) for value in box)
        box_color = tuple(int(value) for value in color)
        cv2.rectangle(image, (x1, y1), (x2, y2), box_color, 2)
        cv2.putText(
            image,
            label,
            (x1, max(15, y1 - 5)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            box_color,
            2,
            lineType=cv2.LINE_AA,
        )

    def process(self, image_path: str):
        raw_image = cv2.imread(str(image_path))
        if raw_image is None:
            raise ValueError(f"Cannot read image: {image_path}")
        rgb_image = cv2.cvtColor(letterbox(raw_image), cv2.COLOR_BGR2RGB)
        image_float = np.float32(rgb_image) / 255.0
        tensor = torch.from_numpy(np.transpose(image_float, (2, 0, 1))).unsqueeze(0)
        tensor = tensor.to(self.device)

        grayscale_cam = self.method(tensor, [self.target])[0]
        with torch.no_grad():
            predictions = self.post_process(self.model(tensor)[0])
        overlay = show_cam_on_image(image_float, grayscale_cam, use_rgb=True)

        if self.show_boxes:
            for prediction in predictions:
                values = prediction.detach().cpu().numpy()
                confidence = float(values[4])
                class_id = int(values[5])
                if self.target_class_ids is not None and class_id not in self.target_class_ids:
                    continue
                class_name = (
                    self.model_names.get(class_id, str(class_id))
                    if isinstance(self.model_names, dict)
                    else self.model_names[class_id]
                )
                self.draw_detection(
                    values[:4],
                    self.colors[class_id],
                    f"{class_name} {confidence:.2f}",
                    overlay,
                )
        return Image.fromarray(overlay), grayscale_cam, predictions, image_float

    def release(self) -> None:
        activations = getattr(self.method, "activations_and_grads", None)
        if activations and hasattr(activations, "release"):
            activations.release()
