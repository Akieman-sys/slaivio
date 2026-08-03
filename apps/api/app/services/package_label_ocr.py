from __future__ import annotations

import base64
import re
from typing import Any

from mistralai.client import Mistral

from app.core.config import settings


PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
WEIGHT_RE = re.compile(r"(?i)(\d+(?:[.,]\d+)?)\s*(?:kg|kgs|kilograms?)\b")
DIMENSIONS_RE = re.compile(r"(?i)(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm)?")
TRACKING_RE = re.compile(r"(?i)(?:tracking|waybill|awb|reference|ref|no[.:#]?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{5,35})")


def _confidence(payload: dict[str, Any]) -> float | None:
    scores = []
    for page in payload.get("pages") or []:
        item = page.get("confidence_scores") or {}
        score = item.get("average_page_confidence_score")
        if isinstance(score, (int, float)):
            scores.append(float(score))
    return round(sum(scores) / len(scores), 4) if scores else None


def read_package_label(content: bytes, mime_type: str) -> dict[str, Any]:
    if not settings.mistral_api_key:
        raise RuntimeError("ocr_not_configured")
    encoded = base64.b64encode(content).decode("ascii")
    response = Mistral(api_key=settings.mistral_api_key).ocr.process(
        model="mistral-ocr-latest",
        document={"type": "image_url", "image_url": f"data:{mime_type};base64,{encoded}"},
        include_image_base64=False,
        confidence_scores_granularity="page",
    )
    payload = response.model_dump(mode="json")
    raw_text = "\n".join(str(page.get("markdown") or "") for page in payload.get("pages") or []).strip()
    phone = PHONE_RE.search(raw_text)
    weight = WEIGHT_RE.search(raw_text)
    dimensions = DIMENSIONS_RE.search(raw_text)
    tracking = TRACKING_RE.search(raw_text)
    extracted: dict[str, Any] = {
        "phone": phone.group(0).strip() if phone else None,
        "tracking_id": tracking.group(1).upper() if tracking else None,
        "weight_kg": float(weight.group(1).replace(",", ".")) if weight else None,
        "length_cm": None, "width_cm": None, "height_cm": None,
    }
    if dimensions:
        values = [float(dimensions.group(i).replace(",", ".")) for i in range(1, 4)]
        if (dimensions.group(4) or "cm").lower() == "mm":
            values = [value / 10 for value in values]
        extracted.update(dict(zip(("length_cm", "width_cm", "height_cm"), values)))
    return {"raw_text": raw_text[:12000], "confidence": _confidence(payload), "fields": extracted}
