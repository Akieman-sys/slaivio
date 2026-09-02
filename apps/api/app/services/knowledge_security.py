from __future__ import annotations

import socket
import struct
import time

from app.core.config import settings

MAX_SCAN_ATTEMPTS = 3


def _scan_once(content: bytes) -> str:
    with socket.create_connection((settings.clamav_host, settings.clamav_port), timeout=15) as sock:
        sock.sendall(b"zINSTREAM\0")
        for offset in range(0, len(content), 65536):
            chunk = content[offset : offset + 65536]
            sock.sendall(struct.pack(">I", len(chunk)))
            sock.sendall(chunk)
        sock.sendall(struct.pack(">I", 0))
        chunks: list[bytes] = []
        while True:
            part = sock.recv(4096)
            if not part:
                break
            chunks.append(part)
            if b"\0" in part:
                break
        return b"".join(chunks).decode("utf-8", "replace")


def scan_bytes(content: bytes) -> dict:
    if not settings.clamav_host:
        if settings.is_deployed and settings.knowledge_antivirus_required:
            raise RuntimeError("knowledge_antivirus_not_configured")
        return {"status": "CLEAN", "engine": "development-bypass", "signature": None}

    last_error: OSError | None = None
    for attempt in range(MAX_SCAN_ATTEMPTS):
        try:
            response = _scan_once(content)
            break
        except OSError as exc:
            last_error = exc
            if attempt + 1 < MAX_SCAN_ATTEMPTS:
                time.sleep(0.15 * (attempt + 1))
    else:
        # A local developer must not be blocked because the optional ClamAV
        # container is stopped. Staging and production always remain fail-closed.
        if not settings.is_deployed:
            return {"status": "CLEAN", "engine": "development-bypass-unavailable", "signature": None}
        raise RuntimeError("knowledge_antivirus_unavailable") from last_error

    if "FOUND" in response:
        return {"status": "REJECTED", "engine": "clamav", "signature": response.strip()}
    if "OK" not in response:
        raise RuntimeError("knowledge_antivirus_invalid_response")
    return {"status": "CLEAN", "engine": "clamav", "signature": None}
