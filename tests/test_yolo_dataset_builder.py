from pathlib import Path

import cv2
import numpy as np
import yaml

from server.algos.detection.dataset_builder import build_dataset


def test_build_dataset_creates_yolo_layout_and_labels(tmp_path: Path):
    image_paths = []
    for index in range(2):
        image_path = tmp_path / f"image_{index}.jpg"
        assert cv2.imwrite(str(image_path), np.zeros((32, 48, 3), dtype=np.uint8))
        image_paths.append(image_path)

    result = build_dataset(
        images=[
            {
                "image_path": str(image_paths[0]),
                "annotations": [{"class_id": 0, "x": 0.1, "y": 0.2, "width": 0.4, "height": 0.5}],
            },
            {"image_path": str(image_paths[1]), "annotations": []},
        ],
        class_names=["shape"],
        out_root=tmp_path / "outputs",
    )

    yaml_path = Path(result["dataset_yaml"])
    data = yaml.safe_load(yaml_path.read_text())
    assert data["names"] == {0: "shape"}
    assert result["train_image_count"] == 1
    assert result["val_image_count"] == 1
    assert result["annotated_image_count"] == 1
    assert list((yaml_path.parent / "labels" / "train").glob("*.txt")) or list((yaml_path.parent / "labels" / "val").glob("*.txt"))


def test_build_dataset_requires_annotations(tmp_path: Path):
    image_paths = []
    for index in range(2):
        image_path = tmp_path / f"image_{index}.jpg"
        assert cv2.imwrite(str(image_path), np.zeros((8, 8, 3), dtype=np.uint8))
        image_paths.append(image_path)

    try:
        build_dataset(
            images=[{"image_path": str(path), "annotations": []} for path in image_paths],
            class_names=["shape"],
            out_root=tmp_path / "outputs",
        )
    except ValueError as exc:
        assert "bounding box" in str(exc)
    else:
        raise AssertionError("Expected empty annotations to be rejected")
