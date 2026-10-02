-- Черновики Telegram-бота: превью записи/правки ждёт нажатия «✓ Сохранить».
-- До нажатия в service_records ничего не пишется.

create table if not exists bot_pending (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  kind text not null check (kind in ('add', 'edit')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists bot_pending_created_at on bot_pending (created_at);

-- Доступ только с сервера через service_role; политик для anon/authenticated нет.
alter table bot_pending enable row level security;
