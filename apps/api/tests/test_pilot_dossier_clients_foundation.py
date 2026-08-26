from pathlib import Path


ROOT = Path(__file__).parents[3]


def migration_sql() -> str:
    return " ".join(
        (ROOT / "infra/sql/092_pilot_dossier_clients_foundation.sql")
        .read_text(encoding="utf-8")
        .lower()
        .split()
    )


def test_pilot_relation_supports_multiple_clients_without_removing_legacy_pointer():
    sql = migration_sql()

    assert "create table if not exists dossier_clients" in sql
    assert "alter table dossiers drop column" not in sql
    assert "alter column client_id drop not null" in sql
    assert "if new.client_id is null then return new" in sql
    assert "legacy primary-client compatibility pointer" in sql
    assert "insert into dossier_clients" in sql
    assert "from dossiers dossier join clients client" in sql
    assert "on conflict (org_id, idempotency_key) where idempotency_key is not null do nothing" in sql


def test_pilot_relation_is_tenant_scoped_versioned_and_idempotent():
    sql = migration_sql()

    assert "foreign key (org_id, dossier_id) references dossiers(org_id, id)" in sql
    assert "foreign key (org_id, client_id) references clients(org_id, id)" in sql
    assert "row_version integer not null default 1" in sql
    assert "sync_version bigint not null default 1" in sql
    assert "uq_dossier_clients_active_relation" in sql
    assert "uq_dossier_clients_active_primary" in sql
    assert "uq_dossier_clients_idempotency" in sql
    assert "maintain_dossier_client_version" in sql
    assert "sync_legacy_dossier_primary_client" in sql


def test_pilot_relation_preserves_attention_archive_and_immutable_history():
    sql = migration_sql()

    for field in (
        "situation text",
        "status_in_dossier text",
        "attention_required boolean",
        "attention_reason text",
        "archived_at timestamptz",
        "archived_by text",
    ):
        assert field in sql

    assert "create table if not exists dossier_client_events" in sql
    assert "audit_dossier_client_change" in sql
    assert "prevent_dossier_client_event_mutation" in sql
    assert "prevent_dossier_client_hard_delete" in sql
    assert "revoke all on dossier_clients from public" in sql
    assert "revoke all on dossier_client_events from public" in sql


def test_client_reference_is_stable_and_unique_per_agency():
    sql = migration_sql()

    assert "add column if not exists client_reference text" in sql
    assert "alter column client_reference set not null" in sql
    assert "uq_clients_org_reference" in sql
    assert "assign_client_reference" in sql
    assert "before insert on clients" in sql
    assert "'cli-' || upper(left(replace(id::text, '-', ''), 12))" in sql


def test_pilot_dossier_api_migration_adds_idempotency_and_permissions():
    sql = " ".join(
        (ROOT / "infra/sql/093_pilot_dossier_api_foundation.sql")
        .read_text(encoding="utf-8")
        .lower()
        .split()
    )

    assert "add column if not exists idempotency_key text" in sql
    assert "uq_dossiers_idempotency" in sql
    assert "where idempotency_key is not null" in sql
    assert "dossiers.clients.read" in sql
    assert "dossiers.clients.manage" in sql
    assert "role.role_code = 'operator'" in sql
    assert "on conflict do nothing" in sql
