"""The Official templates VIPER ships with.

Their workflows are stored in the database like any other template. The seed
file next to this module supplies the rows a database does not have yet.
"""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Template, User


OFFICIAL_SUBJECT = "system:official-templates"
OFFICIAL_EMAIL = "official-templates@viper.local"

SEED_FILE = Path(__file__).with_name("official_templates.json")

# Entries with "enabled": false belong to node groups that are switched off.
# They stay in the seed file so the group can be turned back on, and are not
# written to the database until then.
_SEED = [entry for entry in json.loads(SEED_FILE.read_text(encoding="utf-8")) if entry.get("enabled", True)]

# Cover image of each Official template, under outputs/samples/covers (tracked in git).
# A cover an Admin uploaded is never replaced.
_COVERS = {
    "SIFT (Scale-Invariant Feature Transform)": "sift",
    "FLANN (Fast Library for Approximate Nearest Neighbors)": "flann",
    "PSNR (Peak Signal-to-Noise Ratio)": "psnr",
    "BRISQUE (Blind/Referenceless Image Spatial Quality Evaluator)": "brisque",
    "Otsu Thresholding": "otsu",
    "Active Contour (Snake)": "snake",
    "Homography Estimation": "homography",
    "Shapes — End-to-End Training & Evaluation": "shapes-train",
    "Shapes — Detection & XAI": "shapes-xai",
}


def _cover_url(key: str) -> str | None:
    name = _COVERS.get(key)
    return f"/static/samples/covers/{name}.jpg" if name else None


# (official_key, description) of every template that is seeded.
OFFICIAL_TEMPLATE_CATALOG = tuple((entry["official_key"], entry["description"]) for entry in _SEED)


def _is_empty(workflow: dict | None) -> bool:
    return not (workflow or {}).get("nodes")


def ensure_official_template_records(db: Session) -> None:
    """Create missing official records without replacing Admin-managed data.

    A record created before workflows were stored in the database has an empty
    workflow; it receives the seeded one. A workflow that has nodes is left alone.
    A soft-deleted record still counts as existing, so it is never recreated,
    and its workflow is never refilled.
    """
    owner = db.scalar(select(User).where(User.provider_subject == OFFICIAL_SUBJECT))
    if owner is None:
        owner = User(
            provider="system",
            provider_subject=OFFICIAL_SUBJECT,
            email=OFFICIAL_EMAIL,
            display_name="VIPER Official",
            role="user",
            status="active",
        )
        db.add(owner)
        db.flush()

    existing = {
        template.official_key: template
        for template in db.scalars(select(Template).where(Template.is_official.is_(True))).all()
    }
    for entry in _SEED:
        key = entry["official_key"]
        template = existing.get(key)
        if template is None:
            db.add(Template(
                owner_id=owner.id,
                name=key,
                description=entry["description"],
                visibility="public",
                workflow=entry["workflow"],
                is_official=True,
                official_key=key,
                cover_url=_cover_url(key),
            ))
        elif template.deleted_at is None:
            if _is_empty(template.workflow):
                template.workflow = entry["workflow"]
            if template.cover_url is None:
                template.cover_url = _cover_url(key)
    db.commit()
