import json
from sqlalchemy import text

from app.core.config import settings
from app.db.database import engine


def create_voice_transcription(
    org_id: str,
    media_url: str,
    client_id: str | None = None,
    dossier_id: str | None = None,
    shipment_id: str | None = None,
    media_id: str | None = None,
    provider_message_id: str | None = None,
    content_type: str | None = None,
    provider: str = "meta",
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                insert into voice_transcriptions (
                    org_id,
                    client_id,
                    dossier_id,
                    shipment_id,
                    media_id,
                    provider,
                    provider_message_id,
                    media_url,
                    content_type
                )
                values (
                    :org_id,
                    :client_id,
                    :dossier_id,
                    :shipment_id,
                    :media_id,
                    :provider,
                    :provider_message_id,
                    :media_url,
                    :content_type
                )
                returning *
            """),
            {
                "org_id": org_id,
                "client_id": client_id,
                "dossier_id": dossier_id,
                "shipment_id": shipment_id,
                "media_id": media_id,
                "provider": provider,
                "provider_message_id": provider_message_id,
                "media_url": media_url,
                "content_type": content_type,
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def list_pending_voice_transcriptions(
    org_id: str,
    limit: int = 20,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select *
                from voice_transcriptions
                where org_id = :org_id
                  and transcription_status = 'PENDING'
                order by created_at asc
                limit :limit
            """),
            {
                "org_id": org_id,
                "limit": limit,
            },
        )

        return [dict(row._mapping) for row in result.fetchall()]


def get_voice_transcription(
    org_id: str,
    transcription_id: str,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select *
                from voice_transcriptions
                where org_id = :org_id
                  and id = :transcription_id
                limit 1
            """),
            {
                "org_id": org_id,
                "transcription_id": transcription_id,
            },
        ).fetchone()

        return dict(result._mapping) if result else None


def mark_voice_transcription_processing(
    org_id: str,
    transcription_id: str,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update voice_transcriptions
                set transcription_status = 'PROCESSING'
                where org_id = :org_id
                  and id = :transcription_id
                returning *
            """),
            {
                "org_id": org_id,
                "transcription_id": transcription_id,
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def mark_voice_transcription_completed(
    org_id: str,
    transcription_id: str,
    transcript_text: str,
    language: str | None = None,
    confidence: float | None = None,
    raw_result: dict | None = None,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update voice_transcriptions
                set
                    transcription_status = 'COMPLETED',
                    transcript_text = :transcript_text,
                    language = :language,
                    confidence = :confidence,
                    raw_result = CAST(:raw_result AS jsonb),
                    completed_at = now()
                where org_id = :org_id
                  and id = :transcription_id
                returning *
            """),
            {
                "org_id": org_id,
                "transcription_id": transcription_id,
                "transcript_text": transcript_text,
                "language": language,
                "confidence": confidence,
                "raw_result": json.dumps(raw_result or {}),
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def mark_voice_transcription_failed(
    org_id: str,
    transcription_id: str,
    error_message: str,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update voice_transcriptions
                set
                    transcription_status = 'FAILED',
                    error_message = :error_message
                where org_id = :org_id
                  and id = :transcription_id
                returning *
            """),
            {
                "org_id": org_id,
                "transcription_id": transcription_id,
                "error_message": error_message,
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None
