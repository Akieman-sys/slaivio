import csv,io,json
from datetime import date,timedelta
from sqlalchemy import text
from app.db.database import engine
def _rows(r):return [dict(x._mapping) for x in r]
def _range(start,end):
    finish=end or date.today();begin=start or finish-timedelta(days=29)
    if begin>finish:raise ValueError('invalid_date_range')
    if (finish-begin).days>730:raise ValueError('date_range_too_large')
    days=(finish-begin).days+1;return begin,finish,days
def dashboard(org_id,start=None,end=None):
    start,end,days=_range(start,end);previous_end=start-timedelta(days=1);previous_start=previous_end-timedelta(days=days-1)
    p={'o':org_id,'start':start,'end':end+timedelta(days=1),'ps':previous_start,'pe':previous_end+timedelta(days=1)}
    with engine.connect() as c:
        kpis=dict(c.execute(text("""select
          (select count(*) from clients where org_id=:o and created_at>=:start and created_at<:end)::int clients,
          (select count(*) from cargo_packages where org_id=:o and deleted_at is null and created_at>=:start and created_at<:end)::int packages,
          (select coalesce(sum(weight_kg),0) from cargo_packages where org_id=:o and deleted_at is null and created_at>=:start and created_at<:end)::float weight_kg,
          (select count(*) from cargo_expeditions where org_id=:o and archived_at is null and deleted_at is null and created_at>=:start and created_at<:end)::int shipments,
          (select count(*) from dossiers where org_id=:o and created_at>=:start and created_at<:end)::int dossiers,
          (select count(*) from pickup_orders where org_id=:o and created_at>=:start and created_at<:end)::int pickups,
          (select count(*) from clients where org_id=:o and created_at>=:ps and created_at<:pe)::int previous_clients,
          (select count(*) from cargo_packages where org_id=:o and deleted_at is null and created_at>=:ps and created_at<:pe)::int previous_packages,
          (select count(*) from cargo_expeditions where org_id=:o and archived_at is null and deleted_at is null and created_at>=:ps and created_at<:pe)::int previous_shipments"""),p).mappings().one())
        trend=_rows(c.execute(text("""with days as(select generate_series(cast(:start as date),cast(:end as date)-1,interval '1 day')::date day)
          select d.day,coalesce(c.clients,0)::int clients,coalesce(p.packages,0)::int packages,coalesce(s.shipments,0)::int shipments
          from days d left join(select created_at::date day,count(*) clients from clients where org_id=:o and created_at>=:start and created_at<:end group by 1)c using(day)
          left join(select created_at::date day,count(*) packages from cargo_packages where org_id=:o and deleted_at is null and created_at>=:start and created_at<:end group by 1)p using(day)
          left join(select created_at::date day,count(*) shipments from cargo_expeditions where org_id=:o and archived_at is null and deleted_at is null and created_at>=:start and created_at<:end group by 1)s using(day) order by d.day"""),p))
        statuses={'packages':_rows(c.execute(text("select status label,count(*)::int value from cargo_packages where org_id=:o and deleted_at is null group by status order by value desc"),p)),'shipments':_rows(c.execute(text("select status label,count(*)::int value from cargo_expeditions where org_id=:o and archived_at is null and deleted_at is null group by status order by value desc"),p)),'dossiers':_rows(c.execute(text("select status_global label,count(*)::int value from dossiers where org_id=:o and archived_at is null group by status_global order by value desc"),p))}
        routes=_rows(c.execute(text("""select
          coalesce(nullif(route_label,''),nullif(concat_ws(' → ',nullif(origin_city,''),nullif(destination_city,'')),''),'Route non renseignée') route,
          mode shipping_mode,count(*)::int shipments,coalesce(sum(total_weight_kg),0)::float weight_kg,
          round(avg(extract(epoch from(updated_at-created_at))/86400)::numeric,1)::float average_days
          from cargo_expeditions where org_id=:o and archived_at is null and deleted_at is null and created_at>=:start and created_at<:end
          group by route_label,origin_city,destination_city,mode order by shipments desc limit 20"""),p))
        finance=_rows(c.execute(text("""select currency,count(*) filter(where document_type='INVOICE')::int invoices,
          coalesce(sum(total) filter(where document_type='INVOICE'),0)::float invoiced,
          coalesce(sum(amount_paid) filter(where document_type='INVOICE'),0)::float collected,
          coalesce(sum(balance_due) filter(where document_type='INVOICE' and status not in('VOID','PAID')),0)::float outstanding
          from finance_documents where org_id=:o and created_at>=:start and created_at<:end group by currency order by currency"""),p))
        warehouses=_rows(c.execute(text("""select coalesce(warehouse_name,'Non affecté') warehouse,count(*)::int packages,coalesce(sum(weight_kg),0)::float weight_kg,coalesce(sum(volume_cbm),0)::float volume_cbm,
          count(*) filter(where is_fragile)::int fragile from cargo_packages where org_id=:o and deleted_at is null and inventory_status='IN_STOCK' group by warehouse_name order by packages desc"""),p))
    return {'period':{'start':start,'end':end,'days':days},'kpis':kpis,'trend':trend,'statuses':statuses,'routes':routes,'finance':finance,'warehouses':warehouses}

REPORT_SQL={
 'clients':"select id,name,phone,email,country,created_at from clients where org_id=:o and created_at>=:start and created_at<:end order by created_at desc",
 'packages':"select package_reference,tracking_id,status,client_id,warehouse_name,weight_kg,volume_cbm,destination_country,created_at from cargo_packages where org_id=:o and deleted_at is null and created_at>=:start and created_at<:end order by created_at desc",
 'shipments':"select expedition_reference,status,route_label,origin_city,destination_city,mode shipping_mode,total_weight_kg weight_kg,total_volume_cbm volume_cbm,billed_total,cost_total,profit_total,currency,created_at,updated_at from cargo_expeditions where org_id=:o and archived_at is null and deleted_at is null and created_at>=:start and created_at<:end order by created_at desc",
 'finance':"select document_number,document_type,status,currency,total,amount_paid,balance_due,issue_date,due_date,created_at from finance_documents where org_id=:o and created_at>=:start and created_at<:end order by created_at desc",
 'pickups':"select pickup_reference,status,client_id,recipient_name,recipient_phone,payment_status,required_amount,paid_amount,storage_fee,currency,ready_at,checked_in_at,released_at,created_at from pickup_orders where org_id=:o and created_at>=:start and created_at<:end order by created_at desc"
}
def report_rows(org_id,key,start=None,end=None,limit=10000):
    if key not in REPORT_SQL:raise KeyError(key)
    start,end,_=_range(start,end)
    with engine.connect() as c:return _rows(c.execute(text(REPORT_SQL[key]+' limit :limit'),{'o':org_id,'start':start,'end':end+timedelta(days=1),'limit':limit}))
def csv_export(org_id,actor,key,start=None,end=None):
    rows=report_rows(org_id,key,start,end);output=io.StringIO(newline='');
    if rows:
        writer=csv.DictWriter(output,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    with engine.begin() as c:c.execute(text("insert into report_export_audit(org_id,actor_id,report_key,format,filters,row_count) values(:o,:a,:k,'CSV',cast(:f as jsonb),:n)"),{'o':org_id,'a':actor,'k':key,'f':json.dumps({'start':str(start) if start else None,'end':str(end) if end else None}),'n':len(rows)})
    return output.getvalue(),len(rows)
def views(org_id,user_id):
    with engine.connect() as c:return _rows(c.execute(text("select * from analytics_saved_views where org_id=:o and(owner_id=:u or is_shared) order by updated_at desc"),{'o':org_id,'u':user_id}))
def save_view(org_id,user_id,data):
    with engine.begin() as c:return dict(c.execute(text("""insert into analytics_saved_views(org_id,owner_id,name,report_key,filters,is_shared) values(:o,:u,:name,:report_key,cast(:filters as jsonb),:is_shared)
      on conflict(org_id,owner_id,name) do update set report_key=excluded.report_key,filters=excluded.filters,is_shared=excluded.is_shared,updated_at=now() returning *"""),{'o':org_id,'u':user_id,'filters':json.dumps(data['filters']),**{k:v for k,v in data.items() if k!='filters'}}).mappings().one())
