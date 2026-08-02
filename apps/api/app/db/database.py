from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.pool import NullPool

from app.core.config import settings

DATABASE_URL = settings.database_url or URL.create(
    drivername="postgresql+psycopg2",
    username=settings.supabase_db_user,
    password=settings.supabase_db_password,
    host=settings.supabase_db_host,
    port=settings.supabase_db_port,
    database=settings.supabase_db_name,
    query={"sslmode": settings.database_sslmode},
)

engine = create_engine(DATABASE_URL, poolclass=NullPool)


def test_db_connection() -> bool:
    with engine.connect() as connection:
        connection.execute(text("select 1"))
    return True


def classify_database_error(error: Exception) -> str:
    message = str(error).lower()
    if "tenant/user" in message and "not found" in message:
        return "unknown_tenant_or_user"
    if "password authentication failed" in message:
        return "invalid_credentials"
    if "could not translate host name" in message or "name or service not known" in message:
        return "dns_failure"
    if "connection timed out" in message or "timeout expired" in message:
        return "connection_timeout"
    if "connection refused" in message:
        return "connection_refused"
    if "ssl" in message:
        return "ssl_failure"
    if "too many connections" in message:
        return "connection_limit"
    return "connection_failed"
