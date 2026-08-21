from __future__ import annotations

import base64
import json
import re
from typing import Any

from mistralai.client import Mistral

from app.core.config import settings


PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
WEIGHT_RE = re.compile(r"(?i)(\d+(?:[.,]\d+)?)\s*(?:kg|kgs|kilograms?|公斤|千克)\b")
DIMENSIONS_RE = re.compile(
    r"(?i)(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*"
    r"(\d+(?:[.,]\d+)?)\s*(cm|mm)?"
)
TRACKING_RE = re.compile(r"\b([A-Z]{1,5}\d{8,25})\b", re.I)
SHIPPING_MARK_RE = re.compile(r"#\s*([0-9][0-9\s-]{4,20}[0-9])\s*#")

LANGUAGE_NAMES = {"fr": "French", "en": "English"}
FIELD_NAMES = (
    "carrier", "supplier_tracking", "order_number", "shipping_mark", "recipient_name",
    "recipient_phone", "destination_country", "destination_city", "service_type",
    "warehouse_reference", "supplier_name", "supplier_phone", "shipped_at", "description",
    "category", "subcategory", "goods_classification", "pieces_count", "weight_kg",
    "length_cm", "width_cm", "height_cm", "product_lines", "handwritten_annotations",
)


def _confidence(payload: dict[str, Any]) -> float | None:
    scores = []
    for page in payload.get("pages") or []:
        score = (page.get("confidence_scores") or {}).get("average_page_confidence_score")
        if isinstance(score, (int, float)):
            scores.append(float(score))
    return round(sum(scores) / len(scores), 4) if scores else None


def _message_text(response: Any) -> str:
    content = response.choices[0].message.content
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(str(item.get("text") or "") if isinstance(item, dict) else str(item) for item in content)
    return str(content or "")


def _json_object(value: str) -> dict[str, Any]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", value, re.S)
        if not match:
            return {}
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            return {}
    return parsed if isinstance(parsed, dict) else {}


def _number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        number = float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _integer(value: Any) -> int | None:
    number = _number(value)
    return int(number) if number is not None and number.is_integer() and number > 0 else None


def _text(value: Any, limit: int = 240) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split()).strip(" -:#")
    return cleaned[:limit] or None


def _normalize_tracking(value: Any) -> str | None:
    cleaned = re.sub(r"[^A-Za-z0-9-]", "", str(value or "")).upper()
    return cleaned[:80] if len(cleaned) >= 6 else None


def _fallback_fields(raw_text: str, barcode_value: str | None) -> dict[str, Any]:
    candidates = [match.upper() for match in TRACKING_RE.findall(raw_text)]
    tracking = _normalize_tracking(barcode_value) or (candidates[0] if candidates else None)
    weight = WEIGHT_RE.search(raw_text)
    dimensions = DIMENSIONS_RE.search(raw_text)
    shipping_mark = SHIPPING_MARK_RE.search(raw_text)
    fields: dict[str, Any] = {name: None for name in FIELD_NAMES}
    fields.update({
        "carrier": "YTO Express" if re.search(r"\bYTO\b|圆通", raw_text, re.I) else None,
        "supplier_tracking": tracking,
        "shipping_mark": _text(shipping_mark.group(1)) if shipping_mark else None,
        "destination_country": "RDC" if re.search(r"\bRDC\b", raw_text, re.I) else None,
        "service_type": "Express" if re.search(r"\bexpress\b", raw_text, re.I) else None,
        "weight_kg": _number(weight.group(1)) if weight else None,
        "product_lines": [], "handwritten_annotations": [],
    })
    if dimensions:
        values = [_number(dimensions.group(index)) for index in range(1, 4)]
        if all(value is not None for value in values):
            if (dimensions.group(4) or "cm").lower() == "mm":
                values = [value / 10 for value in values]  # type: ignore[operator]
            fields.update(dict(zip(("length_cm", "width_cm", "height_cm"), values)))
    return fields


def _structured_prompt(raw_text: str, target_language: str, barcode_value: str | None) -> str:
    target = LANGUAGE_NAMES.get(target_language, "French")
    return f"""
Extract operational cargo data from this supplier parcel label. The OCR may contain Chinese and Latin text.
Return one JSON object only. Never invent a missing value.

Translate useful Chinese text to {target}; preserve names, codes, tracking numbers and the original meaning.
The recipient/address block can encode the forwarding agency's final customer with separators such as '#'.
Extract supported customer name, shipping mark, destination, warehouse reference and requested service.

CRITICAL RULES:
- A range in 斤 beside clothing sizes (for example 120-140斤) is a garment fit range, never parcel weight.
- A handwritten number has unknown meaning unless explicitly labelled; put it in handwritten_annotations.
- Prefer the device barcode for supplier_tracking when plausible.
- Ignore advertising and marketplace slogans.
- recipient_phone and supplier_phone must belong to their labelled roles.
- Every scalar field needs OCR evidence and confidence between 0 and 1.
- goods_classification is one of ORDINARY_GOODS, SENSITIVE_GOODS, DANGEROUS_GOODS, FRAGILE,
  ELECTRONICS, BATTERY, LIQUID, FOOD, PHARMACEUTICAL, HIGH_VALUE, or null.

JSON shape:
{{
  "detected_language": "zh",
  "translated_text": "translated useful label text",
  "fields": {{
    "carrier": null, "supplier_tracking": null, "order_number": null, "shipping_mark": null,
    "recipient_name": null, "recipient_phone": null, "destination_country": null,
    "destination_city": null, "service_type": null, "warehouse_reference": null,
    "supplier_name": null, "supplier_phone": null, "shipped_at": null, "description": null,
    "category": null, "subcategory": null, "goods_classification": null, "pieces_count": null,
    "weight_kg": null, "length_cm": null, "width_cm": null, "height_cm": null,
    "product_lines": [{{"reference": null, "description": null, "color": null, "size": null, "quantity": null}}],
    "handwritten_annotations": [{{"value": "140", "meaning": null}}]
  }},
  "field_confidences": {{"supplier_tracking": 0.99}},
  "evidence": {{"supplier_tracking": "YT..."}},
  "ambiguities": ["short explanation"],
  "ignored_text": ["advertising text"]
}}

Device barcode: {barcode_value or 'none'}

OCR text:
{raw_text[:12000]}
""".strip()


def _clean_result(parsed: dict[str, Any], raw_text: str, target_language: str,
                  barcode_value: str | None, ocr_confidence: float | None) -> dict[str, Any]:
    fallback = _fallback_fields(raw_text, barcode_value)
    supplied = parsed.get("fields") if isinstance(parsed.get("fields"), dict) else {}
    fields = {name: supplied.get(name) for name in FIELD_NAMES}
    text_keys = (
        "carrier", "order_number", "shipping_mark", "recipient_name", "recipient_phone",
        "destination_country", "destination_city", "service_type", "warehouse_reference",
        "supplier_name", "supplier_phone", "shipped_at", "description", "category", "subcategory",
    )
    for key in text_keys:
        fields[key] = _text(fields.get(key)) or fallback.get(key)
    fields["supplier_tracking"] = (
        _normalize_tracking(barcode_value) or _normalize_tracking(fields.get("supplier_tracking"))
        or fallback.get("supplier_tracking")
    )
    classification = _text(fields.get("goods_classification"), 40)
    allowed = {"ORDINARY_GOODS", "SENSITIVE_GOODS", "DANGEROUS_GOODS", "FRAGILE", "ELECTRONICS",
               "BATTERY", "LIQUID", "FOOD", "PHARMACEUTICAL", "HIGH_VALUE"}
    fields["goods_classification"] = classification if classification in allowed else None
    fields["pieces_count"] = _integer(fields.get("pieces_count"))
    for key in ("weight_kg", "length_cm", "width_cm", "height_cm"):
        fields[key] = _number(fields.get(key)) if fields.get(key) is not None else fallback.get(key)
    fields["product_lines"] = fields.get("product_lines") if isinstance(fields.get("product_lines"), list) else []
    fields["handwritten_annotations"] = fields.get("handwritten_annotations") if isinstance(fields.get("handwritten_annotations"), list) else []
    fields["tracking_id"] = fields["supplier_tracking"]
    fields["phone"] = fields["recipient_phone"]

    confidences = parsed.get("field_confidences") if isinstance(parsed.get("field_confidences"), dict) else {}
    clean_confidences = {
        key: round(max(0.0, min(1.0, float(value))), 3)
        for key, value in confidences.items()
        if key in fields and isinstance(value, (int, float))
    }
    if fields["supplier_tracking"] and _normalize_tracking(barcode_value) == fields["supplier_tracking"]:
        clean_confidences["supplier_tracking"] = 0.99

    return {
        "raw_text": raw_text[:12000],
        "translated_text": _text(parsed.get("translated_text"), 12000) or raw_text[:12000],
        "detected_language": _text(parsed.get("detected_language"), 20) or "unknown",
        "target_language": target_language,
        "confidence": ocr_confidence,
        "fields": fields,
        "field_confidences": clean_confidences,
        "evidence": parsed.get("evidence") if isinstance(parsed.get("evidence"), dict) else {},
        "ambiguities": parsed.get("ambiguities") if isinstance(parsed.get("ambiguities"), list) else [],
        "ignored_text": parsed.get("ignored_text") if isinstance(parsed.get("ignored_text"), list) else [],
        "barcode_value": _normalize_tracking(barcode_value),
    }


def read_package_label(content: bytes, mime_type: str, *, target_language: str = "fr",
                       barcode_value: str | None = None) -> dict[str, Any]:
    if not settings.mistral_api_key:
        raise RuntimeError("ocr_not_configured")
    language = target_language.lower() if target_language.lower() in LANGUAGE_NAMES else "fr"
    encoded = base64.b64encode(content).decode("ascii")
    client = Mistral(api_key=settings.mistral_api_key)
    response = client.ocr.process(
        model=settings.knowledge_ocr_model,
        document={"type": "image_url", "image_url": f"data:{mime_type};base64,{encoded}"},
        include_image_base64=False,
        confidence_scores_granularity="page",
    )
    payload = response.model_dump(mode="json")
    raw_text = "\n".join(str(page.get("markdown") or "") for page in payload.get("pages") or []).strip()
    if not raw_text:
        raise RuntimeError("ocr_label_unreadable")

    parsed: dict[str, Any] = {}
    try:
        structured = client.chat.complete(
            model="mistral-small-latest",
            messages=[
                {"role": "system", "content": "You are a strict multilingual cargo-label extraction engine. Return valid JSON only."},
                {"role": "user", "content": _structured_prompt(raw_text, language, barcode_value)},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        parsed = _json_object(_message_text(structured))
    except Exception:
        parsed = {"ambiguities": ["structured_extraction_unavailable"]}
    return _clean_result(parsed, raw_text, language, barcode_value, _confidence(payload))
