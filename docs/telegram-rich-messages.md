# Богатое оформление в Telegram-ботах (Rich Messages)

Как сделать ответы бота не «простынёй текста», а структурой: заголовки, таблицы, списки, цитаты, сворачиваемые блоки.
Проверено в боте «Орландо-Механик» (`lib/tgrich.ts`, `lib/bot.ts`), 2026-10-02.

## Где это описано (официально)

- Раздел про формат: <https://core.telegram.org/bots/api#rich-message-formatting-options>
- Метод отправки: <https://core.telegram.org/bots/api#sendrichmessage>
- Список изменений (когда появилось): <https://core.telegram.org/bots/api-changelog> — **Bot API 10.1, 11 июня 2026**; 10.2 (14 июля) добавил блоки-конструкторы, 10.3 (24 августа) — сворачиваемые цитаты и документы.

## Суть в трёх строках

Вместо `sendMessage` вызываем `sendRichMessage` и кладём Markdown в поле `rich_message.markdown`:

```json
{
  "chat_id": 123456789,
  "rich_message": { "markdown": "## Заголовок\n\nТекст с **жирным**.\n\n| А | Б |\n|:--|--:|\n| 1 | 2 |" },
  "reply_markup": { "inline_keyboard": [[{ "text": "Кнопка", "callback_data": "x" }]] }
}
```

Кнопки (`reply_markup`) работают как раньше. Лимит — 32 768 символов (вместо 4096), до 500 блоков.

## Что можно писать в markdown

| Нужно | Синтаксис |
|---|---|
| Заголовки | `# … ` до `###### …` |
| Жирный / курсив / зачёркнутый | `**ж**` `_к_` `~~з~~` |
| Таблица | строка заголовков + `\|:--\|--:\|` + строки (в ячейках только строчное форматирование) |
| Списки | `- пункт`, `1. пункт`, задачи `- [ ]` / `- [x]` |
| Цитата | `> текст` (на **каждой** строке) |
| Разделитель | `---` |
| Сворачиваемый блок («гармошка») | `<details><summary>Заголовок</summary>` … `</details>` (внутри работает Markdown) |
| Код | `` `в строке` `` и тройные кавычки с языком |
| Кнопки прямо в тексте | `<tg-button type="callback_data" data="x">Надпись</tg-button>` |
| Формулы, сноски, карты, галереи | см. официальный раздел |

Есть также режим `html` вместо `markdown` и режим явных блоков `blocks` — выбирается **ровно один**.

## Грабли, на которых уже споткнулись

1. **Экранируй чужой текст.** Всё, что пришло из базы, чата, от пользователя, пропускай через `esc()`: иначе звёздочка, `|`, `<`, `#` в начале строки или `1.` превратятся в разметку. Эталон — `lib/tgrich.ts`.
2. **Ответ нейросети — тоже недоверенный.** Если в промт попадают тексты посторонних людей, модель может выдать ссылку, картинку или `<tg-button>`, и они станут кликабельными в твоём чате. Эталон `llmMd()`: оставляет жирный/списки/заголовки, гасит сырой HTML, `![` и `](`.
3. **У входящего «богатого» сообщения нет поля `text`.** Когда пользователь отвечает на твоё rich-сообщение, в `reply_to_message` придёт `rich_message.blocks`, а не `text`. Если бот узнаёт режим диалога по тексту сообщения — нужен извлекатель (`plainOf()` в `lib/tgrich.ts`). Подсказки с `force_reply` проще слать обычным `sendMessage`.
4. **Таблицы на узком экране** могут листаться вбок: держи 4–5 коротких колонок.
5. **Запасной путь обязателен.** Если Telegram отверг rich-формат (старый клиент, ошибка разметки) — шли тот же текст без разметки (`stripRich()`). Отключатель: переменная `TELEGRAM_RICH=0`.
6. **Редактирование:** у `editMessageText` есть параметр `rich_message`, сообщение можно править.
7. **Потоковый вывод** (как у чат-ботов с «печатает»): `sendRichMessageDraft`, см. документацию.

## Готовый код

### Node/TypeScript
Скопируй `lib/tgrich.ts` из этого репозитория: `esc`, `llmMd`, `quote`, `cell`, `stripRich`, `sendRich`, `plainOf`. Зависит только от небольшой обёртки `tg(method, body)` над HTTPS-запросом к `api.telegram.org`.

### Python (только стандартная библиотека — для ботов вроде «Горящего радара»)

```python
import json, re, urllib.request

def esc(s: str) -> str:
    """Экранирование чужого текста для rich-markdown."""
    s = s.replace("\\", "\\\\")
    s = re.sub(r"([`*_\[\]~|<>$#])", r"\\\1", s)
    s = s.replace("==", "\\=\\=")
    s = re.sub(r"(?m)^([-+])(\s)", r"\\\1\2", s)
    s = re.sub(r"(?m)^(\d+)([.)])(\s)", r"\1\\\2\3", s)
    return s

def tg(token: str, method: str, payload: dict, proxy: str | None = None) -> dict:
    handlers = [urllib.request.ProxyHandler({"https": proxy})] if proxy else []
    opener = urllib.request.build_opener(*handlers)
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    return json.load(opener.open(req, timeout=30))

def send_rich(token: str, chat_id: int, markdown: str, reply_markup=None, proxy=None):
    payload = {"chat_id": chat_id, "rich_message": {"markdown": markdown}}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        r = tg(token, "sendRichMessage", payload, proxy)
        if r.get("ok"):
            return r
    except Exception:
        pass
    # запасной путь: обычный текст без разметки
    plain = re.sub(r"(?m)^#{1,6}\s+|\*\*|~~|^>\s?", "", markdown)
    payload = {"chat_id": chat_id, "text": plain[:4000]}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    return tg(token, "sendMessage", payload, proxy)

# пример
send_rich(TOKEN, CHAT_ID,
    "## 🔥 Горящий тур\n\n"
    "| Куда | Цена |\n|:--|--:|\n| Турция | **48 000 ₽** |\n\n"
    "<details><summary>Подробности</summary>\n\n- 7 ночей\n- вылет из Казани\n\n</details>",
    proxy="http://127.0.0.1:3066")
```

### curl (проверить за минуту)

```bash
curl -s "https://api.telegram.org/bot<ТОКЕН>/sendRichMessage" \
  -H "Content-Type: application/json" \
  -d '{"chat_id":<ID>,"rich_message":{"markdown":"## Привет\n\n- раз\n- два"}}'
```

> Токен подставляй из файла окружения, не печатай в историю командной строки.

## Чего не проверено

Как выглядит rich-сообщение в **старых версиях** клиента — в документации нет. Поэтому запасной путь (п. 5) обязателен, а первую проверку делай на своём телефоне.
