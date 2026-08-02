import os


# The application must be importable without using developer credentials or a
# remote database. Individual integration tests may override this URL.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://slaivio:slaivio@localhost:5432/slaivio_test",
)
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault(
    "PLATFORM_QUARANTINE_ENCRYPTION_KEY",
    "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=",
)
