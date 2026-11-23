# project_n2n/tests/conftest.py
import os

# F2 (final checkpoint): server.config reads these once, at its first import, and the app
# lifespan (create_all, ALTER, Official seed) runs on that engine. Set them here, before any
# test module imports server.*, so no import order can reach the real PostgreSQL in .env.
# load_dotenv() does not override variables that are already set.
os.environ["AUTO_CREATE_TABLES"] = "false"
os.environ["DATABASE_URL"] = "sqlite://"
# Ultralytics patches PIL.Image.open and pip-installs pi-heif into the venv when a file is not
# a known image (e.g. the .pt checks in test_upload_api / test_model_load_security). Tests must
# never change the environment.
os.environ["YOLO_AUTOINSTALL"] = "false"

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # = project root
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))