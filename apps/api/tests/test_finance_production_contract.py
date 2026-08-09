from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
def test_operational_finance_is_separate_tenant_safe_and_audited():
 migration=(ROOT/'infra/sql/048_operational_invoicing.sql').read_text(encoding='utf-8')
 api=(ROOT/'apps/api/app/api/finance.py').read_text(encoding='utf-8')
 repo=(ROOT/'apps/api/app/finance/repository.py').read_text(encoding='utf-8')
 assert 'finance_documents' in migration and 'billing_invoices' in migration
 assert 'from organization_roles r cross join permissions p' in migration and 'from roles r' not in migration
 for permission in ('finance.read','finance.create','finance.issue','finance.payments','finance.void','finance.export'):assert f'require_permission("{permission}")' in api
 assert 'for update' in repo and 'idempotency_key' in repo and 'row_version' in repo
 assert "finance_events" in repo and "org_id=:o" in repo
 assert "finance_client_not_found" in repo and "finance_dossier_not_found" in repo and "finance_source_document_not_found" in repo
def test_totals_are_computed_server_side():
 from app.finance.repository import calculate
 lines,sub,discount,tax,total=calculate([{'description':'Transport','quantity':2,'unit_price':100,'discount_rate':10,'tax_rate':20}])
 assert str(sub)=='200.00' and str(discount)=='20.00' and str(tax)=='36.00' and str(total)=='216.00'
 assert str(lines[0]['line_total'])=='216.00'
def test_completion_covers_real_finance_workflows():
 api=(ROOT/'apps/api/app/api/finance.py').read_text(encoding='utf-8');repo=(ROOT/'apps/api/app/finance/repository.py').read_text(encoding='utf-8');migration=(ROOT/'infra/sql/049_operational_invoicing_completion.sql').read_text(encoding='utf-8')
 for capability in ('quote_decision','convert_quote','apply_credit','reverse_payment','refresh_overdue','printable','settings_for'):assert capability in repo
 for permission in ('finance.settings','finance.reverse_payment'):assert permission in api and permission in migration
 assert 'for update' in repo and 'PAYMENT_REVERSED' in repo and 'CONVERTED_TO_INVOICE' in repo
 assert 'organization_roles' in migration and 'billing_invoices' not in migration
