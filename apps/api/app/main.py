from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Response
from app.api.webhook import router as webhook_router
from app.api.notifications import router as notifications_router
from app.api.dossiers import router as dossiers_router
from app.api.followups import router as followups_router
from app.api.offices import router as offices_router
from app.api.pricing import router as pricing_router
from app.api.manager import router as manager_router
from app.api.shipments import router as shipments_router
from app.api.knowledge import router as knowledge_router
from app.db.database import test_db_connection
from app.api.batches import router as batches_router
from app.api.goods import router as goods_router
from app.api.media import router as media_router
from app.api.client_shipments import router as client_shipments_router
from app.api.broadcasts import router as broadcasts_router
from app.api.escalations import router as escalations_router
from app.api.health import router as health_router
from app.api.notification_retries import router as notification_retries_router
from app.api.voice_notes import router as voice_notes_router
from app.api.whatsapp_templates import router as whatsapp_templates_router
from app.api.manager_events import router as manager_events_router
from app.api.meta_webhook import router as meta_webhook_router
from app.api.meta_embedded_signup import router as meta_embedded_signup_router
from app.api.organization_whatsapp import router as organization_whatsapp_router
from app.api.meta_templates import router as meta_templates_router
from app.api.auth import router as auth_router
from app.api.inbox import router as inbox_router
from app.api.knowledge_settings import router as knowledge_settings_router
from app.api.goods_settings import router as goods_settings_router
from app.api.pricing_settings import router as pricing_settings_router
from app.api.whatsapp_enterprise import router as whatsapp_enterprise_router
from app.api.whatsapp_health import router as whatsapp_health_router
from app.core.exceptions import global_exception_handler
from app.core.logger import logger
from app.core.request_context import generate_request_id
from app.api.conversation_assignments import (
    router as conversation_assignments_router,
)
from app.api.conversation_timeline import (
    router as conversation_timeline_router,
)
from app.api.inbox_replies import router as inbox_replies_router
from app.api.queues import router as queues_router
from app.api.realtime import router as realtime_router
from app.api.presence import router as presence_router
from app.api.ai import router as ai_router
from app.api.ai_drafts import router as ai_drafts_router
from app.api.ai_workflows import router as ai_workflows_router
from app.api.ai_dossier_drafts import router as ai_dossier_drafts_router
from app.api.ai_settings import router as ai_settings_router
from app.api.accounting import router as accounting_router
from app.api.billing import router as billing_router
from app.api.financial_dashboard import router as financial_dashboard_router
from app.api.payments import router as payments_router
from app.api.secure_wallet import router as secure_wallet_router
from app.api.shipment_financial import router as shipment_financial_router
from app.api.wallet import router as wallet_router
from app.api.audit import router as audit_router
from app.api.multi_agency import router as multi_agency_router
from app.api.performance import router as performance_router
from app.api.permissions import router as permissions_router
from app.api.clerk_webhooks import router as clerk_webhook_router
from app.api.entitlements import router as entitlements_router
from app.api.features import router as features_router
from app.api.invitations import router as invitations_router
from app.api.me import router as me_router
from app.api.tenant import router as tenant_router
from app.api.cargo_os import router as cargo_os_router
from app.api.operations_intelligence import (
    router as operations_intelligence_router,
)
from app.api.commercial import router as commercial_router
from app.api.public_landing import router as public_landing_router
from app.api.onboarding import router as onboarding_router
from app.api.onboarding_experience import router as onboarding_experience_router
from app.api.dashboard import router as dashboard_router
from app.api.clients import router as clients_router
from app.api.packages import router as packages_router
from app.api.platform_quarantine import router as platform_quarantine_router
from app.api.tracking import router as tracking_router
from app.api.warehouses import router as warehouses_router
from app.api.pickups import router as pickups_router
from app.api.finance import router as finance_router
from app.api.routes_services import router as routes_services_router
from app.api.departures import router as departures_router
from app.api.documents import router as documents_router
from app.api.organization_admin import router as organization_admin_router


app = FastAPI(title="Slaivio")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(
    Exception,
    global_exception_handler,
)


@app.middleware("http")
async def request_context_middleware(
    request: Request,
    call_next,
):
    request_id = request.headers.get("X-Request-ID") or generate_request_id()
    request.state.request_id = request_id
    logger.info(
        f"request_started:{request_id}:{request.method}:{request.url.path}"
    )
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        f"request_completed:{request_id}:{response.status_code}"
    )
    return response


app.include_router(webhook_router)
app.include_router(batches_router)
app.include_router(notifications_router)
app.include_router(knowledge_router)
app.include_router(dossiers_router)
app.include_router(followups_router)
app.include_router(offices_router)
app.include_router(goods_router)
app.include_router(pricing_router)
app.include_router(manager_router)
app.include_router(shipments_router)
app.include_router(media_router)
app.include_router(client_shipments_router)
app.include_router(broadcasts_router)
app.include_router(escalations_router)
app.include_router(health_router)
app.include_router(notification_retries_router)
app.include_router(voice_notes_router)
app.include_router(whatsapp_templates_router)
app.include_router(manager_events_router)
app.include_router(meta_webhook_router)
app.include_router(meta_embedded_signup_router)
app.include_router(organization_whatsapp_router)
app.include_router(meta_templates_router)
app.include_router(auth_router)
app.include_router(inbox_router)
app.include_router(knowledge_settings_router)
app.include_router(goods_settings_router)
app.include_router(pricing_settings_router)
app.include_router(whatsapp_enterprise_router)
app.include_router(whatsapp_health_router)
app.include_router(conversation_assignments_router)
app.include_router(conversation_timeline_router)
app.include_router(inbox_replies_router)
app.include_router(queues_router)
app.include_router(realtime_router)
app.include_router(presence_router)
app.include_router(ai_router)
app.include_router(ai_drafts_router)
app.include_router(ai_workflows_router)
app.include_router(ai_dossier_drafts_router)
app.include_router(ai_settings_router)
app.include_router(accounting_router)
app.include_router(billing_router)
app.include_router(financial_dashboard_router)
app.include_router(payments_router)
app.include_router(secure_wallet_router)
app.include_router(shipment_financial_router)
app.include_router(wallet_router)
app.include_router(audit_router)
app.include_router(multi_agency_router)
app.include_router(performance_router)
app.include_router(permissions_router)
app.include_router(clerk_webhook_router)
app.include_router(entitlements_router)
app.include_router(features_router)
app.include_router(invitations_router)
app.include_router(me_router)
app.include_router(tenant_router)
app.include_router(cargo_os_router)
app.include_router(operations_intelligence_router)
app.include_router(commercial_router)
app.include_router(public_landing_router)
app.include_router(onboarding_router)
app.include_router(onboarding_experience_router)
app.include_router(dashboard_router)
app.include_router(clients_router)
app.include_router(packages_router)
app.include_router(tracking_router)
app.include_router(finance_router)
app.include_router(routes_services_router)
app.include_router(departures_router)
app.include_router(documents_router)
app.include_router(organization_admin_router)
app.include_router(warehouses_router)
app.include_router(pickups_router)
app.include_router(platform_quarantine_router)


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "Slaivio API",
    }


@app.options("/{full_path:path}")
def options_handler(full_path: str):
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )
