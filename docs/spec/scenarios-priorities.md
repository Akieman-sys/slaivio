# SLAIVIO Cargo Scenarios And Priorities

Source: `/home/akiemane.j/Downloads/Scenarios .pdf` / `Scenarios .pdf`

This document is the working product map for SLAIVIO. It keeps the attached scenario file aligned with the current development priorities.

## Product Rule

SLAIVIO should stay focused on:

- Clerk for authentication and agency/team access.
- Official Meta WhatsApp Cloud API for WhatsApp onboarding, inbox, messages, templates, webhooks, and delivery status.
- Cargo operations from quote to delivery, with finance and warehouse controls.

Legacy WhatsApp provider routes such as Twilio and Infobip should not be exposed in the active product unless a future paid customer explicitly requires them.

## Priority 1: Production Trust Foundation

Status: in progress / mostly implemented.

Goal: make sure every active operation belongs to the right agency and no demo tenant/provider leaks into production behavior.

Covered by recent work:

- Clerk-only dashboard auth.
- Active tenant usage across backend operations.
- Meta-only public WhatsApp surface.
- Removal of demo login and demo WebSocket token.
- Fail-closed tenant resolution without a central organization fallback.

Remaining checks before calling this fully finished:

- Ensure Railway backend no longer defines `APP_ORG_ID`.
- Confirm the Meta-only runtime configuration is complete.
- Confirm Meta webhook receives real inbound message and delivery status in the right org.
- Confirm Clerk organization membership is synced by webhook.

## Priority 2: Core Cargo Operations UX

Goal: make the platform usable by a real cargo agency daily, not just technically functional.

Scenarios included:

- Scenario 4: Shipment creation.
- Scenario 5 / 32: Warehouse receiving.
- Scenario 6 / 33: Groupage, batching, consolidation.
- Scenario 7 / 34: Departure, loading, dispatch.
- Scenario 8 / 31: Arrival destination and pickup preparation.
- Scenario 9: Pickup client and final delivery.
- Scenario 35: Transit and hub movement.
- Scenario 36: Delays and operational exceptions.
- Scenario 37: Shipment cancellation.
- Scenario 38: Return to sender.

Expected product surfaces:

- Shipment lifecycle board.
- Warehouse receiving queue.
- Unknown package queue.
- Batch/consolidation board.
- Dispatch/loading checklist.
- Destination arrival queue.
- Pickup/delivery queue.
- Delay/exception center.
- Cancellation/return workflow.

## Priority 3: Quote, Pricing, And Conversion

Goal: turn WhatsApp inquiries into structured quotes, leads, and shipments.

Scenarios included:

- Scenario 1 / 21: Quote request and quotation workflow.
- Scenario 12 / 23: Shipping schedules and departures.
- Scenario 13 / 28: Goods and cargo restriction checks.
- Scenario 18: Routes and corridors.
- Scenario 20: Agency onboarding and operational configuration.
- Scenario 24: Offices and pickup points.
- Scenario 25: Warehouses.
- Scenario 26: Pricing management.

Expected product surfaces:

- Pending quote queue.
- Quote builder.
- Pricing coverage dashboard.
- Route/corridor manager.
- Goods restrictions manager.
- Office and warehouse setup wizard.
- Agency setup progress checklist.

## Priority 4: Customer Support, Inbox, And Automation

Goal: reduce manual support while keeping agents in control.

Scenarios included:

- Scenario 2 / 22: Tracking request.
- Scenario 11: Arrived but not picked up, storage, followups.
- Scenario 15: Shipment change request.
- Scenario 16: Incident, dispute, package problem.
- Scenario 17: Notifications and automatic relances.
- Scenario 27: Customer management.

Expected product surfaces:

- Tracking reply engine.
- Conversation inbox by role/number.
- Assignment, priority, and status workflow.
- Followup automation.
- Incident/dispute board.
- Customer profile with shipment history.

## Priority 5: Finance And Compliance

Goal: make payments, debts, receipts, and release gates reliable.

Scenarios included:

- Scenario 10: Client payment, deposit, balance.
- Scenario 30: Balances and customer debts.
- Scenario 29: Document management.

Expected product surfaces:

- Payment recording.
- Balance and debt dashboard.
- Pickup blocked by unpaid balance.
- Receipts.
- Proof and document upload.
- Document checklist by shipment.

## Priority 6: Procurement / Sourcing

Goal: support agencies that buy/source products for customers before shipping.

Scenarios included:

- Scenario 3: Sourcing and product purchase.

Expected product surfaces:

- Procurement request board.
- Supplier candidates.
- Supplier quote comparison.
- Supplier payment tracking.
- Quality check with photos/videos.
- Conversion from purchase to shipment.

## Scenario Inventory

- 1: Client asks for a quote.
- 2: Client asks for shipment tracking.
- 3: Client asks for sourcing/product purchase.
- 4: Client wants to create a shipment.
- 5: Supplier drops package at warehouse.
- 6: Consolidation/groupage/batch creation.
- 7: Departure/loading/effective shipment.
- 8: Destination receiving.
- 9: Pickup client/final delivery.
- 10: Client payment/deposit/balance.
- 11: Arrived cargo not picked up/storage/followups.
- 12: Shipping schedules.
- 13: Goods/restriction check.
- 15: Shipment change request.
- 16: Incident/dispute/package problem.
- 17: Notifications and automatic followups.
- 18: Routes/corridors.
- 20: Agency initial onboarding.
- 21: Quotation workflow.
- 22: Tracking workflow.
- 23: Shipping schedule management.
- 24: Office/pickup point management.
- 25: Warehouse management.
- 26: Pricing management.
- 27: Customer management.
- 28: Goods management.
- 29: Document management.
- 30: Balances/debts.
- 31: Arrival/pickup workflow.
- 32: Warehouse receiving workflow.
- 33: Batching/consolidation workflow.
- 34: Shipment dispatch workflow.
- 35: Transit/hub movement workflow.
- 36: Delay/operational exception management.
- 37: Shipment cancellation workflow.
- 38: Return to sender workflow.

## Implementation Principle

When a phase introduces a feature, it should be checked against this map:

- Does it create or update the right tables?
- Does it produce business events?
- Does the dashboard expose the operational queue?
- Does the WhatsApp/AI layer know how to answer or escalate?
- Does the workflow protect money, identity, cargo status, and agency ownership?

