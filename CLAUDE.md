# orlando-ai

AI-помощник владельца Chevrolet Orlando: RAG по выгрузке ТГ-чата сообщества + личная сервисная книжка + триаж-диагностика. Прод: orlando-ai.vercel.app (деплой = git push, Vercel сам собирает).

## Стек

- Next.js 14 (app router) + Tailwind, один экран `app/page.tsx`
- Supabase (REST, только service_role на сервере) — треды чата (pgvector) + история машины
- Mistral `mistral-embed` (1024d) — эмбеддинги для поиска
- OpenRouter: DeepSeek (ответы/триаж), GPT-4o-mini (парсинг записей), Perplexity Sonar (интернет), Gemini 2.5 Flash (звук)
- PWA: `public/manifest.webmanifest` + `public/sw.js` (при правке SW — bump VERSION)

## Структура

```
app/api/       ask | summarize | sonar | diagnose | car | log | export — тонкие роуты, логика в lib/
lib/           ask.ts (RAG+профиль машины CAR_PROFILE) · diagnose.ts (триаж) · car.ts (история)
               openrouter.ts (chat) · mistral.ts (embed) · supabase-rest.ts · http.ts (транспорт)
scripts/       parse/threads/index/seed-* — разовые обработки ТГ-выгрузки (tsx, .env.local)
plans/         планы фич, 1 промт = 1 фаза
```

## Правила проекта

- HTTP наружу — только через `lib/http.ts` (httpPost/httpGet): там обход TLS-fingerprint Cloudflare для Windows (`HTTP_FORCE=curl`).
- Все вызовы LLM — через `chat()` из `lib/openrouter.ts`, эмбеддинги — через `embed()` из `lib/mistral.ts`. Не плодить прямых fetch к провайдерам.
- Профиль машины (VIN, F18D4 1.8 бензин, АКПП 6T40, ремень ГРМ) зашит в `CAR_PROFILE` (`lib/ask.ts`) — все промты берут его оттуда, не дублировать.
- Запись/правка истории машины — только с заголовком `X-Admin-Key` (PIN, env `ADMIN_KEY`). Чтение публичное.
- Публичные LLM-эндпоинты обязаны валидировать длину входа (см. `MAX_SYMPTOM_CHARS`) — не давать гонять через нас произвольные промты.
- Секреты только в `.env.local` (пример — `.env.example`). Никаких ключей в коде и командной строке.
- Ответы LLM с JSON парсить через извлечение `{...}` + валидацию полей (образец — `lib/diagnose.ts`), модель любит markdown-обёртки.

## Команды

```powershell
npm run dev        # localhost:3000 (есть .claude/launch.json → preview)
npm run build      # прод-сборка, гоняй перед коммитом фазы
npm run parse|threads|index|stats   # пайплайн ТГ-выгрузки, разово
```

## Локальная разработка: сеть

- OpenRouter блокирует RU-IP → LLM-вызовы локально работают только при включённом VPN **и** `HTTPS_PROXY=http://127.0.0.1:<порт VPN-прокси>` в `.env.local` (см. `.env.example`). На Vercel ничего этого не нужно.
- `npm run build` НЕ гонять при работающем `npm run dev` — билд ломает dev-серверу `.next`, страница перестаёт гидрироваться.

## Данные

- `data/` в .gitignore — там JSONL выгрузки, в репо не попадают.
- Треды в Supabase: ~65K, поиск `rpc/search_threads` (RRF: вектор + full-text).
