from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.core.logger import logger
from app.db.database import classify_database_error, test_db_connection


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
    return _database_health_response()


@router.get("/health/ready")
@router.get("/ready", include_in_schema=False)
def ready():
    return _database_health_response(ready=True)


def _database_health_response(ready: bool = False):
    try:
        test_db_connection()
    except SQLAlchemyError as exc:
        logger.error(
            "database_readiness_failed:%s:%s",
            type(exc).__name__,
            classify_database_error(exc),
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "not_ready", "database": "unavailable"},
        )
    return {
        "status": "ready" if ready else "ok",
        "database": "ok",
    }
