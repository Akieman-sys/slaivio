import csv
import io

from fastapi import APIRouter,Depends,HTTPException,Query,Request
from pydantic import BaseModel,Field
from starlette.responses import StreamingResponse

from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.expeditions.repository import add_note,create_anomaly,create_notification,resolve_anomaly,update_expedition
from app.tracking.repository import add_manual_event,control_tower,global_timeline,list_views,public_token,public_view,save_view,tracking_detail,tracking_stats

router=APIRouter()
def _user(tenant:dict)->str:return str(tenant.get("user_id") or tenant.get("clerk_user_id") or "system")

class EventPayload(BaseModel):
    event_type:str=Field(min_length=2,max_length=60);title:str=Field(min_length=2,max_length=180);description:str|None=Field(default=None,max_length=1000);location:str|None=Field(default=None,max_length=200);latitude:float|None=Field(default=None,ge=-90,le=90);longitude:float|None=Field(default=None,ge=-180,le=180);occurred_at:str|None=None
class AlertPayload(BaseModel):
    anomaly_type:str="OPERATIONAL";severity:str=Field(default="MEDIUM",pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$");title:str=Field(min_length=2,max_length=180);description:str|None=Field(default=None,max_length=1000)
class ResolvePayload(BaseModel):notes:str|None=Field(default=None,max_length=1000)
class NotePayload(BaseModel):note:str=Field(min_length=1,max_length=4000);priority:str=Field(default="NORMAL",pattern="^(LOW|NORMAL|HIGH|URGENT)$")
class NotificationPayload(BaseModel):channel:str=Field(default="whatsapp",pattern="^(whatsapp|email|sms|internal)$");audience:str="ALL_CLIENTS";recipient:str|None=None;message:str=Field(min_length=2,max_length=1600)
class EtaPayload(BaseModel):eta_at:str;reason:str=Field(min_length=2,max_length=500)
class TokenPayload(BaseModel):expires_at:str|None=None
class SavedViewPayload(BaseModel):name:str=Field(min_length=2,max_length=80);filters:dict=Field(default_factory=dict)
class BulkNotificationPayload(NotificationPayload):tracking_ids:list[str]=Field(min_length=1,max_length=100)

@router.get("/tracking",dependencies=[Depends(require_permission("tracking.read"))])
def index(q:str|None=None,status:str|None=None,risk_level:str|None=None,country:str|None=None,route:str|None=None,warehouse:str|None=None,client_id:str|None=None,container:str|None=None,batch:str|None=None,incident:bool|None=None,page:int=Query(default=1,ge=1),page_size:int=Query(default=30,ge=1,le=100),tenant=Depends(get_current_tenant)):
    result=control_tower(tenant["org_id"],q=q,status=status,risk_level=risk_level,country=country,route=route,warehouse=warehouse,client_id=client_id,container=container,batch=batch,incident=incident,page=page,page_size=page_size)
    return {"status":"ok","items":result["items"],"pagination":result["pagination"]}

@router.get("/tracking/stats",dependencies=[Depends(require_permission("tracking.read"))])
def stats(tenant=Depends(get_current_tenant)):return {"status":"ok","stats":tracking_stats(tenant["org_id"])}
@router.get("/tracking/timeline",dependencies=[Depends(require_permission("tracking.read"))])
def timeline(limit:int=Query(default=80,ge=1,le=200),tenant=Depends(get_current_tenant)):return {"status":"ok","items":global_timeline(tenant["org_id"],limit)}
@router.get("/tracking/views",dependencies=[Depends(require_permission("tracking.read"))])
def views(tenant=Depends(get_current_tenant)):return {"status":"ok","items":list_views(tenant["org_id"],_user(tenant))}
@router.post("/tracking/views",dependencies=[Depends(require_permission("tracking.update"))])
def view_save(body:SavedViewPayload,tenant=Depends(get_current_tenant)):return {"status":"ok","view":save_view(tenant["org_id"],_user(tenant),body.name,body.filters)}

@router.get("/tracking/export",dependencies=[Depends(require_permission("tracking.export"))])
def export(tenant=Depends(get_current_tenant)):
    items=control_tower(tenant["org_id"],page=1,page_size=100)["items"];output=io.StringIO();fields=["tracking_id","status","mode","origin_city","origin_country","destination_city","destination_country","last_location","eta_at","risk_level","is_delayed","packages_count","clients_count","updated_at"]
    writer=csv.DictWriter(output,fieldnames=fields);writer.writeheader()
    for item in items:writer.writerow({key:item.get(key,"") for key in fields})
    return StreamingResponse(iter([output.getvalue()]),media_type="text/csv",headers={"Content-Disposition":'attachment; filename="slaivio-tracking.csv"'})

@router.post("/tracking/notifications/bulk",dependencies=[Depends(require_permission("tracking.notify"))])
def bulk_notify(body:BulkNotificationPayload,tenant=Depends(get_current_tenant)):
    created=[]
    for tracking_id in dict.fromkeys(body.tracking_ids):
        result=create_notification(tenant["org_id"],tracking_id,_user(tenant),{"channel":body.channel,"audience":body.audience,"recipient":body.recipient,"notification_type":"TRACKING_UPDATE","message":body.message})
        if result:created.append(tracking_id)
    return {"status":"ok","created":created,"count":len(created)}

@router.get("/tracking/{tracking_id}",dependencies=[Depends(require_permission("tracking.read"))])
def detail(tracking_id:str,tenant=Depends(get_current_tenant)):
    item=tracking_detail(tenant["org_id"],tracking_id)
    if not item:raise HTTPException(status_code=404,detail="tracking_not_found")
    return {"status":"ok","tracking":item}
@router.post("/tracking/{tracking_id}/events",dependencies=[Depends(require_permission("tracking.update"))])
def event(tracking_id:str,body:EventPayload,tenant=Depends(get_current_tenant)):
    item=add_manual_event(tenant["org_id"],tracking_id,_user(tenant),body.model_dump())
    if not item:raise HTTPException(status_code=404,detail="tracking_not_found")
    return {"status":"ok","tracking":item}
@router.patch("/tracking/{tracking_id}/eta",dependencies=[Depends(require_permission("tracking.update"))])
def eta(tracking_id:str,body:EtaPayload,tenant=Depends(get_current_tenant)):
    item=update_expedition(tenant["org_id"],tracking_id,_user(tenant),{"eta_at":body.eta_at,"delay_reason":body.reason})
    if not item:raise HTTPException(status_code=404,detail="tracking_not_found")
    return {"status":"ok","tracking":item}
@router.post("/tracking/{tracking_id}/alerts",dependencies=[Depends(require_permission("tracking.alerts"))])
def alert(tracking_id:str,body:AlertPayload,tenant=Depends(get_current_tenant)):
    item=create_anomaly(tenant["org_id"],tracking_id,_user(tenant),body.model_dump())
    if not item:raise HTTPException(status_code=404,detail="tracking_not_found")
    return {"status":"ok","tracking":item}
@router.patch("/tracking/{tracking_id}/alerts/{alert_id}/resolve",dependencies=[Depends(require_permission("tracking.alerts"))])
def alert_resolve(tracking_id:str,alert_id:str,body:ResolvePayload,tenant=Depends(get_current_tenant)):
    item=resolve_anomaly(tenant["org_id"],tracking_id,alert_id,_user(tenant),body.notes)
    if not item:raise HTTPException(status_code=404,detail="alert_not_found")
    return {"status":"ok","tracking":item}
@router.post("/tracking/{tracking_id}/notes",dependencies=[Depends(require_permission("tracking.update"))])
def note(tracking_id:str,body:NotePayload,tenant=Depends(get_current_tenant)):
    item=add_note(tenant["org_id"],tracking_id,_user(tenant),{"note":body.note,"priority":body.priority,"visibility":"PRIVATE"})
    if not item:raise HTTPException(status_code=404,detail="tracking_not_found")
    return {"status":"ok","tracking":item}
@router.post("/tracking/{tracking_id}/notifications",dependencies=[Depends(require_permission("tracking.notify"))])
def notify(tracking_id:str,body:NotificationPayload,tenant=Depends(get_current_tenant)):
    item=create_notification(tenant["org_id"],tracking_id,_user(tenant),{"channel":body.channel,"audience":body.audience,"recipient":body.recipient,"notification_type":"TRACKING_UPDATE","message":body.message})
    if not item:raise HTTPException(status_code=404,detail="tracking_not_found")
    return {"status":"ok","tracking":item}
@router.post("/tracking/{tracking_id}/public-token",dependencies=[Depends(require_permission("tracking.public"))])
def token(tracking_id:str,body:TokenPayload,tenant=Depends(get_current_tenant)):
    result=public_token(tenant["org_id"],tracking_id,body.expires_at)
    if not result:raise HTTPException(status_code=404,detail="tracking_not_found")
    return {"status":"ok",**result,"tracking_path":f"/track/{result['public_tracking_token']}"}

@router.get("/public/tracking/{token}")
def public(token:str,request:Request):
    item=public_view(token,request.client.host if request.client else None,request.headers.get("user-agent"))
    if not item:raise HTTPException(status_code=404,detail="tracking_not_found")
    return {"status":"ok","tracking":item}
