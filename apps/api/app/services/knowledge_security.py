from __future__ import annotations
import socket,struct
from app.core.config import settings

def scan_bytes(content:bytes)->dict:
    if not settings.clamav_host:
        if settings.is_deployed and settings.knowledge_antivirus_required: raise RuntimeError("knowledge_antivirus_not_configured")
        return {"status":"CLEAN","engine":"development-bypass","signature":None}
    try:
        with socket.create_connection((settings.clamav_host,settings.clamav_port),timeout=15) as sock:
            sock.sendall(b"zINSTREAM\0")
            for offset in range(0,len(content),65536):
                chunk=content[offset:offset+65536];sock.sendall(struct.pack(">I",len(chunk)));sock.sendall(chunk)
            sock.sendall(struct.pack(">I",0));response=sock.recv(4096).decode("utf-8","replace")
    except OSError as exc: raise RuntimeError("knowledge_antivirus_unavailable") from exc
    if "FOUND" in response:return {"status":"REJECTED","engine":"clamav","signature":response.strip()}
    if "OK" not in response:raise RuntimeError("knowledge_antivirus_invalid_response")
    return {"status":"CLEAN","engine":"clamav","signature":None}
