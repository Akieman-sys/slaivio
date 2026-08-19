-- Repair the Batch / Groupage warehouse relation omitted by migration 087.
--
-- The batch stores the warehouse selected when it is prepared. Existing
-- batches inherit it from their configured route when that relationship is
-- available; no warehouse name or address is duplicated.

alter table shipment_batches
  add column if not exists origin_warehouse_id uuid references warehouses(id);

update shipment_batches batch
set origin_warehouse_id = route.origin_warehouse_id
from shipping_routes route
where route.id = batch.route_id
  and route.org_id = batch.org_id
  and batch.origin_warehouse_id is null
  and route.origin_warehouse_id is not null;

create index if not exists idx_shipment_batches_origin_warehouse
  on shipment_batches(org_id, origin_warehouse_id)
  where archived_at is null;

comment on column shipment_batches.origin_warehouse_id is
  'Warehouse selected for batch preparation, referencing the agency warehouse configuration.';
