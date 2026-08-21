-- Supplier-label intelligence audit trail.
-- The original image stays in package_media; this snapshot preserves exactly
-- what OCR proposed and what language was used when the operator confirmed it.

alter table cargo_packages
  add column if not exists label_ocr_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists label_source_language text,
  add column if not exists label_translation_language text,
  add column if not exists label_scanned_at timestamptz;

alter table package_expectations
  add column if not exists matched_at timestamptz;

create index if not exists idx_packages_label_scanned
  on cargo_packages(org_id, label_scanned_at desc)
  where label_scanned_at is not null and deleted_at is null;

comment on column cargo_packages.label_ocr_snapshot is
  'Structured supplier-label extraction confirmed by an operator; never a silent source of truth.';
comment on column cargo_packages.label_source_language is
  'Language detected on the supplier label.';
comment on column cargo_packages.label_translation_language is
  'Agency interface language used for the translated label.';
