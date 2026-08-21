from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy import text

from app.db.database import engine


def _digits(value: Any) -> str:
    return re.sub(r"\D", "", str(value or ""))


def _words(value: Any) -> str:
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(character for character in value if not unicodedata.combining(character))
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def _name_score(expected: Any, actual: Any) -> int:
    left, right = _words(expected), _words(actual)
    if not left or not right:
        return 0
    if left == right:
        return 100
    left_tokens, right_tokens = set(left.split()), set(right.split())
    overlap = len(left_tokens & right_tokens) / max(len(left_tokens), len(right_tokens))
    similarity = SequenceMatcher(None, left, right).ratio()
    return round(max(overlap, similarity) * 100)


def _row(value: Any) -> dict[str, Any] | None:
    return dict(value._mapping) if value else None


def _compact_dossier(row: Any) -> dict[str, Any]:
    item = dict(row._mapping)
    return {
        "id": str(item["id"]),
        "reference": item.get("dossier_reference"),
        "status": item.get("status_global"),
        "origin_country": item.get("origin_country"),
        "origin_city": item.get("origin_city"),
        "destination_country": item.get("destination_country"),
        "destination_city": item.get("destination_city"),
        "service": item.get("shipping_mode"),
        "package_count": int(item.get("package_count") or 0),
    }


def match_package_label(org_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    """Find an existing expectation, client and dossier without creating data.

    Automatic selection is deliberately conservative. An exact announced-package
    match is trusted; every fuzzy customer match remains visible to the operator.
    """
    tracking = str(fields.get("supplier_tracking") or "").strip()
    shipping_mark = str(fields.get("shipping_mark") or "").strip()
    order_number = str(fields.get("order_number") or "").strip()
    phone = _digits(fields.get("recipient_phone"))
    name = str(fields.get("recipient_name") or "").strip()
    country = _words(fields.get("destination_country"))

    with engine.connect() as connection:
        duplicate = None
        if tracking:
            duplicate = _row(connection.execute(text("""
                select id, package_reference, tracking_id, supplier_tracking, status
                from cargo_packages
                where org_id = :org_id and deleted_at is null
                  and (lower(coalesce(supplier_tracking, '')) = lower(:tracking)
                    or lower(coalesce(tracking_id, '')) = lower(:tracking))
                order by created_at desc limit 1
            """), {"org_id": org_id, "tracking": tracking}).fetchone())

        expectation = None
        if tracking or shipping_mark or order_number:
            expectation = _row(connection.execute(text("""
                select e.id, e.client_id, e.dossier_id, e.supplier_tracking, e.shipping_mark,
                       e.order_number, e.description, e.expected_at,
                       c.name client_name, c.phone client_phone, c.email client_email
                from package_expectations e
                join clients c on c.id = e.client_id and c.org_id = e.org_id
                where e.org_id = :org_id and e.status = 'EXPECTED'
                  and (
                    (:tracking <> '' and lower(e.supplier_tracking) = lower(:tracking))
                    or (:shipping_mark <> '' and lower(coalesce(e.shipping_mark, '')) = lower(:shipping_mark))
                    or (:order_number <> '' and lower(coalesce(e.order_number, '')) = lower(:order_number))
                  )
                order by
                  case when :tracking <> '' and lower(e.supplier_tracking) = lower(:tracking) then 0 else 1 end,
                  e.created_at desc
                limit 1
            """), {
                "org_id": org_id, "tracking": tracking,
                "shipping_mark": shipping_mark, "order_number": order_number,
            }).fetchone())

        clients = connection.execute(text("""
            select id, name, phone, normalized_phone, email, country
            from clients
            where org_id = :org_id and deleted_at is null
            order by updated_at desc nulls last, created_at desc
            limit 500
        """), {"org_id": org_id}).fetchall()

        ranked: list[dict[str, Any]] = []
        expectation_client_id = str(expectation["client_id"]) if expectation else None
        for client_row in clients:
            client = dict(client_row._mapping)
            client_id = str(client["id"])
            reasons: list[str] = []
            score = 0
            if expectation_client_id == client_id:
                score, reasons = 100, ["Colis attendu retrouvé"]
            else:
                client_phone = _digits(client.get("normalized_phone") or client.get("phone"))
                if phone and client_phone and (phone == client_phone or phone[-9:] == client_phone[-9:]):
                    score += 75
                    reasons.append("Même numéro de téléphone")
                similarity = _name_score(name, client.get("name"))
                if similarity >= 92:
                    score += 55
                    reasons.append("Nom identique")
                elif similarity >= 72:
                    score += 35
                    reasons.append("Nom proche")
                if country and country == _words(client.get("country")):
                    score += 5
                    reasons.append("Même pays")
                score = min(score, 99)
            if score < 35:
                continue

            dossiers = connection.execute(text("""
                select d.id, d.dossier_reference, d.status_global, d.origin_country, d.origin_city,
                       d.destination_country, d.destination_city, d.shipping_mode,
                       (select count(*) from cargo_packages p where p.org_id=d.org_id
                         and p.dossier_id=d.id and p.deleted_at is null)::int package_count
                from dossiers d
                where d.org_id = :org_id and d.client_id = cast(:client_id as uuid)
                  and d.archived_at is null
                  and d.status_global not in ('COMPLETED','CLOSED','CANCELLED')
                order by
                  case when d.id = cast(nullif(:expected_dossier_id, '') as uuid) then 0 else 1 end,
                  d.updated_at desc nulls last, d.created_at desc
                limit 12
            """), {
                "org_id": org_id, "client_id": client_id,
                "expected_dossier_id": str(expectation.get("dossier_id") or "") if expectation else "",
            }).fetchall()
            ranked.append({
                "score": score,
                "reasons": reasons,
                "client": {
                    "id": client_id, "name": client.get("name"), "phone": client.get("phone"),
                    "email": client.get("email"), "country": client.get("country"),
                },
                "expectation": ({
                    "id": str(expectation["id"]),
                    "dossier_id": str(expectation["dossier_id"]) if expectation.get("dossier_id") else None,
                    "supplier_tracking": expectation.get("supplier_tracking"),
                    "shipping_mark": expectation.get("shipping_mark"),
                    "order_number": expectation.get("order_number"),
                    "description": expectation.get("description"),
                    "expected_at": expectation.get("expected_at"),
                } if expectation_client_id == client_id else None),
                "dossiers": [_compact_dossier(item) for item in dossiers],
            })

    ranked.sort(key=lambda item: item["score"], reverse=True)
    best = ranked[0] if ranked else None
    second_score = ranked[1]["score"] if len(ranked) > 1 else 0
    automatic = best if best and best["score"] >= 95 and best["score"] - second_score >= 8 else None
    if duplicate:
        duplicate = {key: (str(value) if key == "id" and value else value) for key, value in duplicate.items()}
    return {
        "duplicate_package": duplicate,
        "matches": ranked[:5],
        "automatic_match": automatic,
        "requires_client_selection": automatic is None,
    }
