from pydantic import BaseModel
from datetime import datetime


class NormalizedMessage(BaseModel):
    provider_message_id: str | None = None
    from_phone: str
    to_phone: str | None = None
    text_body: str | None = None
    message_type: str = "text"
    received_at: datetime
    source_channel: str = "whatsapp"
    dedupe_key: str
    conversation_jid: str | None = None
    sender_name: str | None = None
    conversation_name: str | None = None
    is_group: bool = False
