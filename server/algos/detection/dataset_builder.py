"""Build a self-contained YOLO dataset from images and browser annotations."""

from __future__ import annotations

import json
import random
import shutil
import uuid
from pathlib import Path
from typing import Any, Iterable

import yaml


def _normalise_box(raw: dict[str, Any], class_count: int) -> tuple[int, float, float, float, float]:
    class_id = int(raw["class_id"])
    if not 0 <= class_id < class_count:
        raise ValueError(f"Annotation class_id {class_id} is not in the configured class list")

    x = float(raw["x"])
    y = float(raw["y"])
    width = float(raw["width"])
    height = float(raw["height"])
    if width <= 0 or height <= 0:
        raise ValueError("Every annotation box must have a positive width and height")
    if not all(0 <= value <= 1 for value in (x, y, width, height)):
        raise ValueError("Annotation boxes must use normalised coordinates between 0 and 1")

    # Preserve the box centre while preventing a drag slightly outside an image
    # from generating an invalid YOLO label.
    left, top = max(0.0, x), max(0.0, y)
    right, bottom = min(1.0, x + width), min(1.0, y + height)
    width, height = right - left, bottom - top
    if width <= 0 or height <= 0:
        raise ValueError("Annotation box is outside the image")
    return class_id, left + width / 2, top + height / 2, width, height


def build_dataset(
    images: Iterable[dict[str, Any]],
    class_names: Iterable[str],
    out_root: str | Path,
    *,
    name: str | None = None,
    validation_split: float = 0.2,
) -> dict[str, Any]:
    """Copy annotated images into a YOLO directory and generate ``data.yaml``."""
    classes = [str(item).strip() for item in class_names if str(item).strip()]
    if not classes:
        raise ValueError("Add at least one class name before creating a dataset")
    if len(set(classes)) != len(classes):
        raise ValueError("Class names must be unique")
    if not 0 < validation_split < 1:
        raise ValueError("validation_split must be between 0 and 1")

    image_list = list(images)
    if len(image_list) < 2:
        raise ValueError("Upload at least 2 images so VIPER can create train and validation splits")

    root = Path(out_root) / "detection" / "datasets" / (name or f"dataset_{uuid.uuid4().hex[:8]}")
    if root.exists():
        raise ValueError(f"Dataset output already exists: {root}")

    validation_count = max(1, round(len(image_list) * validation_split))
    validation_count = min(validation_count, len(image_list) - 1)
    validation_indices = set(random.Random(7).sample(range(len(image_list)), validation_count))
    annotated_images = 0

    for index, item in enumerate(image_list):
        source = Path(str(item.get("image_path", ""))).expanduser().resolve()
        if not source.is_file():
            raise FileNotFoundError(f"Dataset image not found: {source}")

        split = "val" if index in validation_indices else "train"
        image_dir = root / "images" / split
        label_dir = root / "labels" / split
        image_dir.mkdir(parents=True, exist_ok=True)
        label_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{index:04d}_{source.name}"
        destination = image_dir / filename
        shutil.copy2(source, destination)

        boxes = [_normalise_box(box, len(classes)) for box in item.get("annotations", [])]
        if boxes:
            annotated_images += 1
        label_path = label_dir / f"{Path(filename).stem}.txt"
        label_path.write_text(
            "\n".join(
                f"{class_id} {center_x:.6f} {center_y:.6f} {width:.6f} {height:.6f}"
                for class_id, center_x, center_y, width, height in boxes
            )
            + ("\n" if boxes else ""),
            encoding="utf-8",
        )

    if not annotated_images:
        raise ValueError("Draw at least one bounding box before creating a dataset")

    yaml_path = root / "data.yaml"
    yaml_path.write_text(
        yaml.safe_dump(
            {
                "path": str(root),
                "train": "images/train",
                "val": "images/val",
                "names": {index: class_name for index, class_name in enumerate(classes)},
            },
            allow_unicode=True,
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    summary = {
        "status": "success",
        "tool": "YOLODatasetBuilder",
        "dataset_dir": str(root),
        "dataset_yaml": str(yaml_path),
        "class_names": classes,
        "image_count": len(image_list),
        "annotated_image_count": annotated_images,
        "train_image_count": len(image_list) - validation_count,
        "val_image_count": validation_count,
    }
    json_path = root / "viper_dataset_result.json"
    json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    summary["json_path"] = str(json_path)
    return summary
