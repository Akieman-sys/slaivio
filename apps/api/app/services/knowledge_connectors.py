from __future__ import annotations
import json
from cryptography.fernet import Fernet
import httpx
from app.core.config import settings

def _fernet():
    key=settings.knowledge_connector_encryption_key or settings.platform_quarantine_encryption_key
    if not key:raise RuntimeError("knowledge_connector_encryption_not_configured")
    return Fernet(key.encode("ascii"))
def encrypt_credentials(value:dict)->str:return _fernet().encrypt(json.dumps(value).encode()).decode()
def decrypt_credentials(value:str)->dict:return json.loads(_fernet().decrypt(value.encode()).decode())

def discover(provider:str,credentials:dict,configuration:dict)->list[dict]:
    token=credentials.get("access_token")
    if not token:raise RuntimeError("connector_access_token_missing")
    headers={"Authorization":f"Bearer {token}"};items=[]
    with httpx.Client(timeout=30) as client:
        if provider=="GOOGLE_DRIVE":
            response=client.get("https://www.googleapis.com/drive/v3/files",headers=headers,params={"pageSize":100,"fields":"files(id,name,mimeType,modifiedTime,webViewLink,md5Checksum)","q":"trashed=false"})
            response.raise_for_status();items=response.json().get("files",[])
            return [{"external_id":x["id"],"title":x["name"],"mime_type":x.get("mimeType"),"external_modified_at":x.get("modifiedTime"),"external_url":x.get("webViewLink"),"content_hash":x.get("md5Checksum")} for x in items]
        if provider=="NOTION":
            headers["Notion-Version"]="2022-06-28";headers["Content-Type"]="application/json"
            response=client.post("https://api.notion.com/v1/search",headers=headers,json={"page_size":100,"filter":{"property":"object","value":"page"}});response.raise_for_status();items=response.json().get("results",[])
            return [{"external_id":x["id"],"title":next((p.get("plain_text","") for v in x.get("properties",{}).values() for p in v.get("title",[])),"Page Notion"),"mime_type":"application/x-notion-page","external_modified_at":x.get("last_edited_time"),"external_url":x.get("url"),"content_hash":x.get("last_edited_time")} for x in items]
        if provider=="SHAREPOINT":
            site=configuration.get("site_id");drive=configuration.get("drive_id")
            if not site or not drive:raise RuntimeError("sharepoint_site_and_drive_required")
            response=client.get(f"https://graph.microsoft.com/v1.0/sites/{site}/drives/{drive}/root/children",headers=headers);response.raise_for_status();items=response.json().get("value",[])
            return [{"external_id":x["id"],"title":x["name"],"mime_type":x.get("file",{}).get("mimeType"),"external_modified_at":x.get("lastModifiedDateTime"),"external_url":x.get("webUrl"),"content_hash":x.get("eTag")} for x in items if x.get("file")]
    raise RuntimeError("unsupported_knowledge_connector")
