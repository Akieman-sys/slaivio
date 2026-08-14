from fastapi import APIRouter, Depends, Query
from sqlalchemy import text

from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.db.database import engine


router = APIRouter(prefix="/references", tags=["references"])


def _rows(conn, sql: str, params: dict) -> list[dict]:
    return [dict(row._mapping) for row in conn.execute(text(sql), params).fetchall()]


@router.get("")
def reference_catalog(
    q: str | None = Query(default=None, max_length=100),
    workspace_id: str | None = None,
    tenant=Depends(get_current_tenant),
    _=Depends(require_permission("references.read")),
):
    """Tenant-scoped labels and IDs used by relational form controls.

    This endpoint intentionally returns compact references, not copies of the
    owning module records. The owning modules remain the source of truth.
    """
    params = {
        "org_id": tenant["org_id"],
        "q": f"%{(q or '').strip()}%",
        "workspace_id": workspace_id,
    }
    with engine.connect() as conn:
        clients = _rows(conn, f"""
            select id::text id, coalesce(nullif(display_name,''),nullif(name,''),phone,id::text) label,
                   coalesce(phone,email) secondary
            from clients where org_id=:org_id and deleted_at is null
              and (:q='%%' or coalesce(display_name,name,phone,email,'') ilike :q)
            order by label limit 250
        """, params)
        dossiers = _rows(conn, f"""
            select d.id::text id,d.dossier_reference label,
                   coalesce(c.display_name,c.name,d.client_full_name) secondary,d.client_id::text client_id
            from dossiers d left join clients c on c.org_id=d.org_id and c.id=d.client_id
            where d.org_id=:org_id and d.archived_at is null
              and (:workspace_id is null or d.workspace_id=:workspace_id)
              and (:q='%%' or d.dossier_reference ilike :q or coalesce(c.display_name,c.name,d.client_full_name,'') ilike :q)
            order by d.updated_at desc limit 250
        """, params)
        routes = _rows(conn, f"""
            select id::text id,route_name label,
                   concat_ws(' · ',transport_mode,origin_city||' → '||destination_city) secondary,
                   transport_mode shipping_mode,origin_country,origin_city,destination_country,destination_city
            from shipping_routes where org_id=:org_id and status not in('ARCHIVED','INACTIVE')
              and (:q='%%' or route_name ilike :q or coalesce(origin_city,'') ilike :q or coalesce(destination_city,'') ilike :q)
            order by route_name limit 250
        """, params)
        services = _rows(conn, f"""
            select distinct s.id::text id,s.service_name label,
                   concat_ws(' · ',s.shipping_mode,r.route_name) secondary,coalesce(o.route_id,s.route_id)::text route_id,
                   s.shipping_mode,s.status
            from shipping_services s
            left join service_route_offerings o on o.org_id=s.org_id and o.service_id=s.id
              and o.availability in('AVAILABLE','LIMITED') and o.effective_from<=now()
              and (o.effective_until is null or o.effective_until>now())
            left join shipping_routes r on r.org_id=s.org_id and r.id=coalesce(o.route_id,s.route_id)
            where s.org_id=:org_id and s.status not in('ARCHIVED','INACTIVE')
              and (:q='%%' or s.service_name ilike :q or s.service_code ilike :q or coalesce(r.route_name,'') ilike :q)
            order by s.service_name limit 250
        """, params)
        warehouses = _rows(conn, f"""
            select id::text id,warehouse_name label,concat_ws(', ',city,country_code) secondary
            from warehouses where org_id=:org_id and active
              and (:q='%%' or warehouse_name ilike :q or coalesce(city,'') ilike :q)
            order by warehouse_name limit 250
        """, params)
        offices = _rows(conn, f"""
            select id::text id,concat_ws(' — ',city,office_type) label,
                   concat_ws(', ',address,country) secondary
            from agency_offices where org_id=:org_id and is_active
              and (:q='%%' or city ilike :q or country ilike :q or address ilike :q)
            order by city limit 250
        """, params)
        departures = _rows(conn, f"""
            select d.id::text id,d.departure_code label,
                   concat_ws(' · ',r.route_name,d.scheduled_at::text) secondary,
                   d.shipping_service_id::text shipping_service_id,d.status
            from cargo_departures d
            join shipping_services s on s.org_id=d.org_id and s.id=d.shipping_service_id
            left join shipping_routes r on r.org_id=s.org_id and r.id=s.route_id
            where d.org_id=:org_id and d.status not in('CANCELLED','COMPLETED','ARRIVED')
              and (:workspace_id is null or d.workspace_id=:workspace_id)
              and (:q = '%%' or d.departure_code ilike :q or coalesce(r.route_name,'') ilike :q)
            order by d.scheduled_at limit 250
        """, params)
    return {
        "clients": clients,
        "dossiers": dossiers,
        "routes": routes,
        "services": services,
        "warehouses": warehouses,
        "offices": offices,
        "departures": departures,
    }


@router.get("/integrity")
def reference_integrity(
    tenant=Depends(get_current_tenant),
    _=Depends(require_permission("references.audit")),
):
    with engine.connect() as conn:
        rows = _rows(conn, """
            select entity_type,entity_id::text,reference,missing_relations
            from platform_reference_integrity
            where org_id=:org_id and cardinality(missing_relations)>0
            order by entity_type,reference limit 1000
        """, {"org_id": tenant["org_id"]})
    return {"items": rows, "count": len(rows)}
