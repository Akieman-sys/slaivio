from app.services.package_label_matching import _name_score
from app.services.package_label_ocr import _clean_result, _fallback_fields


SAMPLE_OCR = """
YTO 圆通
YT8889503050397
2026/07/22 14:51:01
600-L08-00-010
AMILUN #80 056 239# DIVINE DE MARIE RDC AML#MUSEMU 814849498#express
D268 提花满星 黑, 2XL 120-140斤 [1]件
手写 140
"""


def test_supplier_label_fallback_never_treats_chinese_clothing_size_as_weight():
    fields = _fallback_fields(SAMPLE_OCR, None)
    assert fields["supplier_tracking"] == "YT8889503050397"
    assert fields["carrier"] == "YTO Express"
    assert fields["destination_country"] == "RDC"
    assert fields["service_type"] == "Express"
    assert fields["shipping_mark"] == "80 056 239"
    assert fields["weight_kg"] is None


def test_device_barcode_has_priority_and_handwriting_remains_an_annotation():
    result = _clean_result(
        {
            "detected_language": "zh",
            "translated_text": "Vêtements destinés à la RDC",
            "fields": {
                "supplier_tracking": "WRONG12345678",
                "weight_kg": None,
                "handwritten_annotations": [{"value": "140", "meaning": None}],
            },
            "field_confidences": {"supplier_tracking": 0.2},
        },
        SAMPLE_OCR,
        "fr",
        "YT8889503050397",
        0.91,
    )
    assert result["fields"]["supplier_tracking"] == "YT8889503050397"
    assert result["field_confidences"]["supplier_tracking"] == 0.99
    assert result["fields"]["handwritten_annotations"][0]["meaning"] is None


def test_customer_name_matching_accepts_accents_and_word_order_noise():
    assert _name_score("DIVINE DE MARIE", "Divine de Marie") == 100
    assert _name_score("Marie Divine", "DIVINE MARIE") >= 70
    assert _name_score("Divine de Marie", "Autre Client") < 35


def test_supplier_label_migration_preserves_ocr_audit_and_expectation_match_time():
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    migration = (root / "infra/sql/091_supplier_label_intelligence.sql").read_text(encoding="utf-8")
    assert "label_ocr_snapshot jsonb" in migration
    assert "label_source_language" in migration
    assert "label_translation_language" in migration
    assert "matched_at timestamptz" in migration


def test_supplier_tracking_creation_is_race_safe():
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    repository = (root / "apps/api/app/packages/repository.py").read_text(encoding="utf-8")
    api = (root / "apps/api/app/api/packages.py").read_text(encoding="utf-8")
    assert "pg_advisory_xact_lock" in repository
    assert "supplier_tracking_already_exists" in repository
    assert "status_code=409" in api


def test_package_physical_values_do_not_copy_dossier_estimates():
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    repository = (root / "apps/api/app/packages/repository.py").read_text(encoding="utf-8")
    assert '"weight_kg": payload.get("weight_kg")' in repository
    assert "volume_cbm = _calculate_volume_cbm(payload)\n" in repository
