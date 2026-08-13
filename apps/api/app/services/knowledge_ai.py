from __future__ import annotations
import base64
from mistralai.client import Mistral
from app.core.config import settings

def ocr_document(content:bytes,mime_type:str)->dict:
    if not settings.mistral_api_key:raise RuntimeError("knowledge_ocr_not_configured")
    encoded=base64.b64encode(content).decode("ascii")
    response=Mistral(api_key=settings.mistral_api_key).ocr.process(model=settings.knowledge_ocr_model,document={"type":"document_url" if mime_type=="application/pdf" else "image_url","document_url" if mime_type=="application/pdf" else "image_url":f"data:{mime_type};base64,{encoded}"},include_image_base64=False,confidence_scores_granularity="page")
    payload=response.model_dump(mode="json");pages=payload.get("pages") or [];text="\n\n".join(str(p.get("markdown") or "") for p in pages).strip();scores=[p.get("confidence_scores",{}).get("average_page_confidence_score") for p in pages];scores=[float(x) for x in scores if isinstance(x,(int,float))]
    return {"text":text[:2_000_000],"confidence":sum(scores)/len(scores) if scores else None,"pages":len(pages)}

def embed_texts(texts:list[str])->list[list[float]]:
    if not settings.mistral_api_key:raise RuntimeError("knowledge_embeddings_not_configured")
    result=Mistral(api_key=settings.mistral_api_key).embeddings.create(model=settings.knowledge_embedding_model,inputs=[t[:8000] for t in texts])
    return [list(item.embedding) for item in result.data]

def translate_text(title:str,content:str,target_language:str)->dict:
    if not settings.mistral_api_key:raise RuntimeError("knowledge_translation_not_configured")
    prompt=f"Translate faithfully to {target_language}. Preserve facts, numbers, links and formatting. Return title on first line, then content.\nTITLE: {title}\nCONTENT:\n{content}"
    result=Mistral(api_key=settings.mistral_api_key).chat.complete(model="mistral-small-latest",messages=[{"role":"user","content":prompt}],temperature=0)
    value=str(result.choices[0].message.content or "");head,_,body=value.partition("\n");return {"title":head.strip(),"content":body.strip() or value}
