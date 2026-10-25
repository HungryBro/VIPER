"""Standalone Train -> Detect -> four CAM methods. No VIPER runtime imports."""
from __future__ import annotations

import argparse
import importlib.util
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import yaml

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
METHODS = {"GradCAM", "GradCAMPlusPlus", "EigenCAM", "LayerCAM"}


def resolve_path(value):
    path = Path(value).expanduser()
    return (path if path.is_absolute() else PROJECT / path).resolve()


def require_file(value, label):
    path = resolve_path(value)
    if not path.is_file():
        raise ValueError(f"{label} not found: {path}")
    return path


def integer(value, label, minimum=0):
    if type(value) is not int or value < minimum:
        raise ValueError(f"{label} must be an integer >= {minimum}")


def probability(value, label, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 1 or (positive and value == 0):
        raise ValueError(f"{label} must be {'> 0 and ' if positive else ''}between 0 and 1")


def load_settings(path):
    settings = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(settings, dict):
        raise ValueError("Settings must be a YAML mapping")
    dataset = require_file(settings["dataset_yaml"], "Dataset YAML")
    model = require_file(settings["base_model"], "Base model")
    if model.suffix != ".pt" or not model.is_relative_to(PROJECT / "models"):
        raise ValueError("base_model must select an existing .pt file inside VIPER/models/")
    images = settings["test_images"]
    if not isinstance(images, list) or not images:
        raise ValueError("test_images must be a nonempty list of image paths")
    images = [require_file(item, "Test image") for item in images]
    output = resolve_path(settings["output_dir"])
    if output == HERE or not output.is_relative_to(HERE):
        raise ValueError(f"output_dir must be a subfolder inside {HERE}/")
    data = yaml.safe_load(dataset.read_text(encoding="utf-8"))
    root = Path(data.get("path", dataset.parent)).expanduser()
    root = (root if root.is_absolute() else dataset.parent / root).resolve()
    if not root.is_dir() or output.is_relative_to(root):
        raise ValueError("Dataset root must exist and cannot contain the experiment outputs")
    # VIPER Dataset Builder emits train/val directories under this root. Keep
    # those exact splits, and reject unsupported external split references.
    for split in ("train", "val"):
        if not isinstance(data.get(split), str):
            raise ValueError(f"Expected Dataset Builder's {split} directory in data.yaml")
        source = (root / data[split]).resolve()
        if not source.is_dir() or not source.is_relative_to(root):
            raise ValueError(f"Dataset {split} must be an existing directory inside {root}")
        if not any(item.is_file() and item.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"} for item in source.rglob("*")):
            raise ValueError(f"Dataset {split} contains no images: {source}")
        data[split] = source.relative_to(root).as_posix()
    if not data.get("names"):
        raise ValueError("Dataset YAML has no class names")
    class_count = len(data["names"])
    train, detect, cam = (settings[key] for key in ("train", "detect", "gradcam"))
    integer(train["epochs"], "train.epochs", 1)
    integer(train["batch"], "train.batch", 1)
    integer(train["seed"], "train.seed")
    integer(train["workers"], "train.workers")
    if type(train["deterministic"]) is not bool:
        raise ValueError("train.deterministic must be true or false")
    for section, options in (("train", train), ("detect", detect), ("gradcam", cam)):
        integer(options["image_size"], f"{section}.image_size", 32)
        device = options.get("device")
        if device is not None and (isinstance(device, bool) or not isinstance(device, (str, int))):
            raise ValueError(f"{section}.device must be null, a string, or an integer")
    for section, options in (("detect", detect), ("gradcam", cam)):
        probability(options["confidence"], f"{section}.confidence")
        probability(options["iou"], f"{section}.iou")
        classes = options.get("class_ids")
        if classes is not None and (not isinstance(classes, list) or any(type(c) is not int or not 0 <= c < class_count for c in classes)):
            raise ValueError(f"{section}.class_ids must be null or a list of class IDs 0..{class_count - 1}")
    if not isinstance(cam["methods"], list) or not cam["methods"] or any(method not in METHODS for method in cam["methods"]):
        raise ValueError(f"gradcam.methods must select from {sorted(METHODS)}")
    if len(set(cam["methods"])) != len(cam["methods"]):
        raise ValueError("gradcam.methods contains duplicate methods")
    if cam.get("target_layers") is not None and (not isinstance(cam["target_layers"], list) or any(type(i) is not int for i in cam["target_layers"])):
        raise ValueError("gradcam.target_layers must be null or a list of integer layer indices")
    probability(cam["ratio"], "gradcam.ratio", positive=True)
    integer(cam["color_seed"], "gradcam.color_seed")
    if type(cam["show_boxes"]) is not bool or cam["target_output_type"] not in ("class", "box", "all"):
        raise ValueError("Invalid gradcam.show_boxes or gradcam.target_output_type")
    if not isinstance(settings.get("preview", {}), dict) or type(settings.get("preview", {}).get("show", True)) is not bool:
        raise ValueError("preview.show must be true or false")
    return settings, dataset, root, data, model, images, output


def check_dependencies():
    missing = [package for package, module in (("ultralytics", "ultralytics"), ("grad-cam", "pytorch_grad_cam"), ("torch", "torch"), ("opencv-python", "cv2"), ("scikit-learn", "sklearn"), ("ttach", "ttach")) if importlib.util.find_spec(module) is None]
    if missing:
        raise ValueError(f"Missing dependencies: {', '.join(missing)}. Run: python3 -m pip install -r {HERE / 'requirements.txt'}")


def run_experiment(loaded, reuse_weights=None, *, no_show=False):
    settings, dataset, source_root, data, base_model, images, output = loaded
    check_dependencies()  # Fail before training when CAM dependencies are absent.
    runtime = HERE / ".runtime"
    runtime.mkdir(exist_ok=True)
    os.environ["YOLO_CONFIG_DIR"] = str(runtime)
    os.environ["MPLCONFIGDIR"] = str(runtime / "matplotlib")
    from ultralytics import YOLO
    from cam_runner import save_cam
    import cv2

    # Unique directories prevent overwriting either earlier experiments or VIPER.
    folder = output / f"run_{datetime.now():%Y%m%d_%H%M%S}_{uuid4().hex[:6]}"
    folder.mkdir(parents=True, exist_ok=False)
    print(f"Experiment: {folder}", flush=True)
    (folder / "settings.yaml").write_text(yaml.safe_dump(settings, sort_keys=False, allow_unicode=True), encoding="utf-8")
    input_dir = folder / "inputs"
    input_dir.mkdir()
    copied_images = []
    for index, image in enumerate(images):
        copied = input_dir / f"{index + 1:03d}_{image.name}"
        shutil.copy2(image, copied)
        copied_images.append(copied)
    if reuse_weights is None:
        print(f"Copying shared dataset: {dataset}", flush=True)
        local_root = input_dir / "dataset"
        shutil.copytree(source_root, local_root, ignore=shutil.ignore_patterns("*.cache", "*.cache.npy"))
        data = dict(data, path=str(local_root))
        local_yaml = input_dir / "data.yaml"
        local_yaml.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")
        # Work on a copy of the selected base weights, leaving the shared file alone.
        local_base = input_dir / base_model.name
        shutil.copy2(base_model, local_base)
        train = settings["train"]
        kwargs = dict(data=str(local_yaml), epochs=train["epochs"], imgsz=train["image_size"],
                      batch=train["batch"], seed=train["seed"], deterministic=train["deterministic"],
                      workers=train["workers"], project=str(folder), name="train", exist_ok=False)
        if train.get("device") is not None:
            kwargs["device"] = train["device"]
        print(f"Training {base_model.name}: {train['epochs']} epochs", flush=True)
        result = YOLO(str(local_base)).train(**kwargs)
        weights = Path(result.save_dir) / "weights" / "best.pt"
        if not weights.is_file():
            raise RuntimeError(f"Training did not produce best.pt: {weights}")
    else:
        weights = input_dir / "reused.pt"
        shutil.copy2(reuse_weights, weights)
        print(f"Reusing weights (training skipped): {reuse_weights}", flush=True)

    detect = settings["detect"]
    detector = YOLO(str(weights))
    detect_dir = folder / "detect"
    detect_dir.mkdir()
    failures = []
    for image in copied_images:
        kwargs = dict(source=str(image), conf=detect["confidence"], iou=detect["iou"],
                      imgsz=detect["image_size"], verbose=False)
        if detect.get("class_ids"):
            kwargs["classes"] = detect["class_ids"]
        if detect.get("device") is not None:
            kwargs["device"] = detect["device"]
        prediction = detector.predict(**kwargs)[0]
        if not cv2.imwrite(str(detect_dir / f"{image.stem}.jpg"), prediction.plot()):
            raise RuntimeError(f"Could not save detection image: {image}")
        print(f"Detect {image.name}: {len(prediction.boxes)} boxes", flush=True)
        for method in settings["gradcam"]["methods"]:
            try:
                save_cam(weights, image, method, settings["gradcam"], folder / "gradcam" / method, image.stem)
            except Exception as exc:
                failures.append(f"{image.name} / {method}: {exc}")
                print(f"FAILED {failures[-1]}", file=sys.stderr, flush=True)
    print(f"Images: {folder / 'detect'}\nCAM images: {folder / 'gradcam'}", flush=True)
    from preview_results import build_comparison, show_comparison
    comparison = build_comparison(folder, copied_images, settings["gradcam"]["methods"])
    print(f"Combined image: {comparison}", flush=True)
    if not no_show and settings.get("preview", {}).get("show", True):
        try:
            show_comparison(comparison)
        except Exception as exc:
            # A GUI problem must not invalidate already generated model outputs.
            print(f"Cannot open preview window: {exc}. Open {comparison} manually.", file=sys.stderr)
    if failures:
        raise RuntimeError(f"{len(failures)} CAM task(s) failed. See errors above; other images were saved.")
    print("Completed Train / Detect / Grad-CAM experiment.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=HERE / "settings.yaml")
    parser.add_argument("--list-models", action="store_true", help="List local base models and exit")
    parser.add_argument("--check", action="store_true", help="Validate settings, input files and dependencies without training")
    parser.add_argument("--weights", type=Path, help="Optional existing experiment weights: skip training and repeat Detect/CAM")
    parser.add_argument("--no-show", action="store_true", help="Save comparison.png without opening the image window")
    args = parser.parse_args()
    if args.list_models:
        for path in sorted((PROJECT / "models").rglob("*.pt")):
            print(path.relative_to(PROJECT))
        return 0
    try:
        loaded = load_settings(args.config.resolve())
        reuse = require_file(args.weights, "Reuse weights") if args.weights else None
        if args.check:
            print(f"Dataset: {loaded[1]}\nBase model: {loaded[4]}\nTest images: {loaded[5]}\nOutput: {loaded[6]}")
            check_dependencies()
            print("Settings, inputs and dependencies are available.")
        else:
            run_experiment(loaded, reuse, no_show=args.no_show)
        return 0
    except (ValueError, OSError, KeyError, TypeError, RuntimeError, ImportError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
