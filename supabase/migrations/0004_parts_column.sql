-- Структурированный список запчастей/материалов с артикулами и ценами.
-- Каждый элемент: { name, brand?, article?, qty?, unit?, price? }

alter table service_records
  add column if not exists parts jsonb not null default '[]'::jsonb;

create index if not exists service_records_parts_gin
  on service_records using gin (parts);
