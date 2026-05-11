-- ============================================================
-- Personal car maintenance history
-- ============================================================

create table if not exists service_records (
  id              uuid        primary key default gen_random_uuid(),
  date            date        not null,
  mileage_km      int,
  works           text[]      not null default '{}',
  materials       text[]      not null default '{}',
  cost_works      numeric,
  cost_materials  numeric,
  cost_total      numeric,
  notes           text,
  source          text                  default 'manual',
  created_at      timestamptz not null  default now()
);

create index if not exists service_records_date_idx     on service_records (date desc);
create index if not exists service_records_mileage_idx  on service_records (mileage_km desc);

-- Удобное представление: всё отсортировано от свежего к старому.
create or replace view service_records_recent as
  select * from service_records order by date desc, mileage_km desc nulls last;
