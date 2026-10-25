"""Save and display the input, detection and four CAM overlays together."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

CAM_ORDER = ("GradCAM", "GradCAMPlusPlus", "EigenCAM", "LayerCAM")


def build_comparison(folder, images, selected_methods):
    """One row per test image, always in the same six-column order."""
    import matplotlib

    tile = 340
    row_height = tile + 70
    background = "#111827"
    sheet = Image.new("RGB", (tile * 6, row_height * len(images)), background)
    draw = ImageDraw.Draw(sheet)
    font_path = Path(matplotlib.get_data_path()) / "fonts/ttf/DejaVuSans.ttf"
    font = ImageFont.truetype(str(font_path), 18)
    small = ImageFont.truetype(str(font_path), 14)
    titles = ("Input", "Detect", *CAM_ORDER)
    for row, image in enumerate(images):
        image = Path(image)
        top = row * row_height
        draw.text((12, top + 8), image.name, fill="#cbd5e1", font=small)
        paths = [image, folder / "detect" / f"{image.stem}.jpg"] + [
            folder / "gradcam" / method / f"{image.stem}_overlay.jpg"
            for method in CAM_ORDER
        ]
        for column, (title, path) in enumerate(zip(titles, paths)):
            left = column * tile
            draw.text((left + 12, top + 32), title, fill="white", font=font)
            draw.rectangle((left + 7, top + 62, left + tile - 7, top + row_height - 7), outline="#475569")
            if path.is_file():
                with Image.open(path) as original:
                    thumbnail = ImageOps.contain(original.convert("RGB"), (tile - 20, tile - 14))
                x = left + (tile - thumbnail.width) // 2
                y = top + 62 + (tile - 14 - thumbnail.height) // 2
                sheet.paste(thumbnail, (x, y))
            else:
                message = "Not selected" if title in CAM_ORDER and title not in selected_methods else "No output (failed)"
                draw.text((left + 18, top + 160), message, fill="#fbbf24", font=small)
    destination = folder / "comparison.png"
    sheet.save(destination)
    return destination


def show_comparison(path):
    """Restore a GUI backend after Ultralytics switches matplotlib to Agg."""
    import matplotlib
    import matplotlib.pyplot as plt

    # Ultralytics commonly leaves Agg active after training. Select a GUI
    # backend explicitly so plt.show() actually opens a window from the CLI.
    noninteractive = {"agg", "pdf", "svg", "ps", "pgf", "cairo", "template"}
    if matplotlib.get_backend().lower() in noninteractive:
        candidates = ("MacOSX", "TkAgg", "QtAgg") if sys.platform == "darwin" else ("TkAgg", "QtAgg")
        for backend in candidates:
            try:
                plt.switch_backend(backend)
                break
            except (ImportError, RuntimeError):
                continue
        else:
            print(f"No graphical backend available. Open the saved comparison: {path}", flush=True)
            return
    with Image.open(path) as original:
        image = original.convert("RGB")
    height = min(12, max(4, 18 * image.height / image.width))
    figure, axis = plt.subplots(figsize=(18, height))
    figure.canvas.manager.set_window_title("YOLO — Input / Detect / Grad-CAM")
    axis.imshow(image)
    axis.axis("off")
    figure.tight_layout(pad=0.2)
    print("Showing comparison. Close the image window to finish.", flush=True)
    try:
        plt.show(block=True)
    finally:
        plt.close(figure)
