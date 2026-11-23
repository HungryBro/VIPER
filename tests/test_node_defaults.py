"""The backend's parameter defaults must match the ones the app shows.

my-react-flow-app/src/lib/nodeDefaults.json is where a node's defaults are
written. The settings dialogs display it and the canvas sends it, so a backend
default only takes effect for direct API callers; when the two disagree, the
API and the app compute different results for the "same" defaults.
"""
import inspect
import json
from pathlib import Path

import pytest

from server.algos.Classification import snake_adapter
from server.algos.feature import orb_adapter, sift_adapter, surf_adapter
from server.routers.alignment import AffineReq, HomographyReq
from server.routers.classification import OtsuReq, SnakeReq
from server.routers.detection import YOLODetectReq, YOLOGradCAMReq, YOLOTrainReq
from server.routers.evaluation import DetectionEvaluationReq, YOLOClassificationEvaluationReq
from server.routers.matching import MatchReq

DEFAULTS_FILE = Path(__file__).resolve().parents[1] / "my-react-flow-app" / "src" / "lib" / "nodeDefaults.json"
APP_DEFAULTS = json.loads(DEFAULTS_FILE.read_text(encoding="utf-8"))


def _model_defaults(model) -> dict:
    return {name: field.default for name, field in model.model_fields.items() if not field.is_required()}


def _signature_defaults(func) -> dict:
    return {
        name: p.default for name, p in inspect.signature(func).parameters.items()
        if p.default is not inspect.Parameter.empty
    }


# node type -> the defaults the backend applies when a request omits a parameter.
# Parameters the app writes in a different form (comma-separated id lists, an
# "AUTO" that the API spells None, a model path the API resolves itself) are
# left out by only comparing keys present on both sides with comparable values.
BACKEND = {
    "sift": lambda: sift_adapter.DEFAULTS,
    "orb": lambda: orb_adapter.DEFAULTS,
    "surf": lambda: surf_adapter.DEFAULTS,
    "otsu": lambda: _model_defaults(OtsuReq),
    "snake": lambda: {**_signature_defaults(snake_adapter.run), **_model_defaults(SnakeReq)},
    "homography-align": lambda: _model_defaults(HomographyReq),
    "affine-align": lambda: _model_defaults(AffineReq),
    "bfmatcher": lambda: _model_defaults(MatchReq),
    "flannmatcher": lambda: _model_defaults(MatchReq),
    "yolo-train": lambda: _model_defaults(YOLOTrainReq),
    "yolo-detect": lambda: _model_defaults(YOLODetectReq),
    "yolo-gradcam": lambda: _model_defaults(YOLOGradCAMReq),
    "detection-evaluation": lambda: _model_defaults(DetectionEvaluationReq),
    "classification-evaluation": lambda: _model_defaults(YOLOClassificationEvaluationReq),
}

NOT_COMPARABLE = {
    ("bfmatcher", "lowe_ratio"), ("flannmatcher", "lowe_ratio"),  # API None = pick by descriptor type
    ("bfmatcher", "norm_type"),  # API None = "AUTO"
    ("yolo-detect", "model_path"), ("yolo-gradcam", "model_path"),  # API None = the default model
    ("yolo-detect", "class_ids"), ("yolo-gradcam", "target_layers"), ("yolo-gradcam", "target_class_ids"),  # "" vs None
}


@pytest.mark.parametrize("node_type", sorted(BACKEND))
def test_backend_defaults_match_the_app(node_type):
    app = APP_DEFAULTS[node_type]
    backend = BACKEND[node_type]()
    shared = [key for key in app if key in backend and (node_type, key) not in NOT_COMPARABLE]
    assert shared, f"{node_type}: no parameter compared; the key names no longer line up"
    mismatches = {key: {"app": app[key], "backend": backend[key]} for key in shared if app[key] != backend[key]}
    assert not mismatches, f"{node_type}: {mismatches}"
