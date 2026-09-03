"""Database records that add social features to VIPER's built-in templates."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Template, User


OFFICIAL_SUBJECT = "system:official-templates"
OFFICIAL_EMAIL = "official-templates@viper.local"

# ``official_key`` intentionally matches the frontend built-in template name.
# The workflow itself stays in the frontend catalogue; this database row stores
# only community data such as the cover, comments, and comment setting.
OFFICIAL_TEMPLATE_CATALOG = (
    ("SIFT (Scale-Invariant Feature Transform)", "Extract robust SIFT image features."),
    ("FLANN (Fast Library for Approximate Nearest Neighbors)", "Match image features with FLANN."),
    ("PSNR (Peak Signal-to-Noise Ratio)", "Measure image reconstruction quality with PSNR."),
    ("BRISQUE (Blind/Referenceless Image Spatial Quality Evaluator)", "Estimate no-reference image quality with BRISQUE."),
    ("Otsu Thresholding", "Segment an image using Otsu thresholding."),
    ("Active Contour (Snake)", "Segment an image using an active contour."),
    ("Homography Estimation", "Align images with feature matches and a homography."),
    ("Shapes — End-to-End Training & Evaluation", "Build, train, detect, explain, and evaluate a Shapes YOLO workflow."),
    ("Shapes — Detection & XAI", "Run the bundled Shapes detector and Grad-CAM workflow."),
)


def ensure_official_template_records(db: Session) -> None:
    """Create missing official records without replacing Admin-managed data."""
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

    existing_keys = set(db.scalars(
        select(Template.official_key).where(Template.is_official.is_(True))
    ).all())
    for key, description in OFFICIAL_TEMPLATE_CATALOG:
        if key in existing_keys:
            continue
        db.add(Template(
            owner_id=owner.id,
            name=key,
            description=description,
            visibility="public",
            workflow={"version": 1, "nodes": [], "edges": []},
            is_official=True,
            official_key=key,
        ))
    db.commit()
