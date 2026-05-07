# orlando-ai

AI-помощник владельца Chevrolet Orlando. RAG поверх выгрузки ТГ-чата сообщества + ответы LLM.

## Статус

В разработке. Сейчас готов парсер сырого JSON Telegram-экспорта.

## Установка

```powershell
cd C:\Users\user\projects\orlando-ai
npm install
```

## Использование

### 1. Парсинг ТГ-экспорта в нормализованный JSONL

По умолчанию читает `result.json` из папки выгрузки в Downloads. Путь можно переопределить переменной `INPUT`.

```powershell
npm run parse
```

Результат: `data/messages.jsonl` — по одной нормализованной записи на строку.

Что выкидывается:
- Сервисные сообщения (миграции, добавления участников)
- Пустые сообщения (только медиа без текста)
- Сообщения короче 30 символов
- Только эмодзи / только пробелы
- Знакомства («Всем привет, я Иван из Тамбова»)

### 2. Статистика

```powershell
npm run stats
```

## Структура

```
scripts/
  parse.ts    — JSON Telegram → messages.jsonl (нормализация + фильтр шума)
  threads.ts  — messages.jsonl → threads.jsonl (TODO: группировка в треды)
  stats.ts    — статистика по messages.jsonl
lib/
  types.ts    — типы данных
data/         — gitignored, тут жёлтые JSONL
```

## Дальше по плану

См. `C:\Users\user\.claude\plans\tidy-launching-elephant.md`.
