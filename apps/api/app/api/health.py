from fastapi import APIRouter

from app.db.database import test_db_connection


router = APIRouter()


@router.get("/health")
def health():
    return {
        "status": "ok",
        "service": "slaivio-api",
    }


@router.get("/health/live")
def liveness():
    return {"status": "ok"}


@router.get("/health/db")
def db_health():
    test_db_connection()

    return {
        "status": "database connected",
    }


@router.get("/health/ready")
@router.get("/ready", include_in_schema=False)
def ready():
    test_db_connection()

    return {
        "status": "ready",
        "database": "ok",
    }
