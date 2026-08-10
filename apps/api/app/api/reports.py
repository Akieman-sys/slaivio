from datetime import date
from fastapi import APIRouter,Depends,HTTPException,Query
from fastapi.responses import Response
from pydantic import BaseModel,Field
from app.core.auth import get_current_manager
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.reports import repository as repo
router=APIRouter(prefix='/reports',tags=['reports'])
def user(m):return str(m.get('user_id') or m.get('id'))
class SavedView(BaseModel):name:str=Field(min_length=2,max_length=80);report_key:str;filters:dict={};is_shared:bool=False
@router.get('/analytics',dependencies=[Depends(require_permission('analytics.read'))])
def analytics(start:date|None=None,end:date|None=None,tenant=Depends(get_current_tenant)):
 try:return {'status':'ok',**repo.dashboard(tenant['org_id'],start,end)}
 except ValueError as e:raise HTTPException(422,str(e))
@router.get('/{report_key}/preview',dependencies=[Depends(require_permission('reports.read'))])
def preview(report_key:str,start:date|None=None,end:date|None=None,tenant=Depends(get_current_tenant)):
 try:return {'status':'ok','rows':repo.report_rows(tenant['org_id'],report_key,start,end,200)}
 except KeyError:raise HTTPException(404,'unknown_report')
@router.get('/{report_key}/export',dependencies=[Depends(require_permission('reports.export'))])
def export(report_key:str,start:date|None=None,end:date|None=None,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
 try:content,count=repo.csv_export(tenant['org_id'],user(manager),report_key,start,end)
 except KeyError:raise HTTPException(404,'unknown_report')
 return Response(content.encode('utf-8-sig'),media_type='text/csv',headers={'Content-Disposition':f'attachment; filename="slaivio-{report_key}.csv"','X-Row-Count':str(count)})
@router.get('/views/all',dependencies=[Depends(require_permission('reports.read'))])
def get_views(tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):return {'status':'ok','views':repo.views(tenant['org_id'],user(manager))}
@router.post('/views',dependencies=[Depends(require_permission('reports.manage'))])
def post_view(body:SavedView,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
 if body.report_key not in repo.REPORT_SQL:raise HTTPException(422,'unknown_report')
 return {'status':'ok','view':repo.save_view(tenant['org_id'],user(manager),body.model_dump())}
