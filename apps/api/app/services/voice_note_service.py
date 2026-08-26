import os

from app.core.config import settings
from app.db.voice_transcription_repository import (
    create_voice_transcription,
    mark_voice_transcription_processing,
    mark_voice_transcription_completed,
    mark_voice_transcription_failed,
    list_pending_voice_transcriptions,
    get_voice_transcription,
)

from app.db.message_repository import create_dossier_event
from app.services.meta_media_service import download_meta_media_to_tempfile
from app.services.mistral_transcription_service import transcribe_audio_file


def create_voice_transcription_job(
    org_id: str,
    client_id: str,
    dossier_id: str,
    shipment_id: str | None,
    media_id: str | None,
    provider_message_id: str | None,
    media_url: str,
    content_type: str | None,
):
    job = create_voice_transcription(
        org_id=org_id,
        client_id=client_id,
        dossier_id=dossier_id,
        shipment_id=shipment_id,
        media_id=media_id,
        provider_message_id=provider_message_id,
        media_url=media_url,
        content_type=content_type,
        provider="meta",
    )

    if job:
        create_dossier_event(
            org_id=org_id,
            dossier_id=dossier_id,
            event_type="VOICE_TRANSCRIPTION_CREATED",
            payload={
                "voice_transcription_id": str(job["id"]),
                "media_id": media_id,
                "provider_message_id": provider_message_id,
            },
        )

    return job


def process_voice_transcription(
    org_id: str,
    transcription_id: str,
):
    job = get_voice_transcription(
        org_id=org_id,
        transcription_id=transcription_id,
    )

    if not job:
        return {
            "status": "error",
            "message": "voice_transcription_not_found",
        }

    if job["transcription_status"] not in {"PENDING", "FAILED"}:
        return {
            "status": "error",
            "message": "voice_transcription_not_processable",
            "current_status": job["transcription_status"],
        }

    mark_voice_transcription_processing(
        org_id=org_id,
        transcription_id=transcription_id,
    )

    temp_path = None

    try:
        temp_path = download_meta_media_to_tempfile(
            media_url=job["media_url"],
            content_type=job.get("content_type"),
            org_id=org_id,
        )

        result = transcribe_audio_file(temp_path)

        transcript_text = result.get("text") or ""

        if not transcript_text.strip():
            raise ValueError("Empty transcription result")

        completed = mark_voice_transcription_completed(
            org_id=org_id,
            transcription_id=transcription_id,
            transcript_text=transcript_text,
            language=result.get("language"),
            confidence=result.get("confidence"),
            raw_result=result.get("raw"),
        )

        create_dossier_event(
            org_id=org_id,
            dossier_id=str(job["dossier_id"]),
            event_type="VOICE_TRANSCRIPTION_COMPLETED",
            payload={
                "voice_transcription_id": transcription_id,
                "transcript_text": transcript_text,
            },
        )

        return {
            "status": "ok",
            "transcription": completed,
            "text": transcript_text,
        }

    except Exception as error:
        failed = mark_voice_transcription_failed(
            org_id=org_id,
            transcription_id=transcription_id,
            error_message=str(error),
        )

        create_dossier_event(
            org_id=org_id,
            dossier_id=str(job["dossier_id"]),
            event_type="VOICE_TRANSCRIPTION_FAILED",
            payload={
                "voice_transcription_id": transcription_id,
                "error": str(error),
            },
        )

        return {
            "status": "failed",
            "error": str(error),
            "transcription": failed,
        }

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


def process_due_voice_transcriptions(
    org_id: str,
    limit: int = 10,
):
    jobs = list_pending_voice_transcriptions(
        org_id=org_id,
        limit=limit,
    )

    results = []

    for job in jobs:
        result = process_voice_transcription(
            org_id=org_id,
            transcription_id=str(job["id"]),
        )

        results.append({
            "voice_transcription_id": str(job["id"]),
            "result": result,
        })

    return {
        "status": "ok",
        "count": len(results),
        "results": results,
    }
