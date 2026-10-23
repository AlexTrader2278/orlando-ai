-- Напоминания о ТО: показания пробега, введённые владельцем в боте, и журнал отправленных напоминаний.
-- Выполнить в Supabase → SQL Editor (как 0005_bot_pending.sql).

create table if not exists odometer_readings (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  km integer not null check (km > 0 and km < 1500000),
  created_at timestamptz not null default now()
);

create index if not exists odometer_readings_date on odometer_readings (date desc, km desc);

-- По одной строке на пункт регламента (item_id из lib/maintenance-plan.ts): что и когда уже напоминали.
create table if not exists reminder_log (
  item_id text primary key,
  last_status text not null check (last_status in ('ok', 'soon', 'overdue')),
  notified_at timestamptz not null default now(),
  snoozed_until date
);

-- Доступ только с сервера через service_role; политик для anon/authenticated нет.
alter table odometer_readings enable row level security;
alter table reminder_log enable row level security;
