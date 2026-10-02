import { httpPost, httpGetBinary } from "./http";

const API = "https://api.telegram.org";
// Лимит Telegram — 4096 символов; берём с запасом.
const TG_LIMIT = 4000;

export type InlineButton = { text: string; callback_data: string };
export type ReplyMarkup =
  | { inline_keyboard: InlineButton[][] }
  | { force_reply: true; input_field_placeholder?: string };

function botToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await httpPost(`${API}/bot${botToken()}/${method}`, body, {}, 30_000);
  let json: { ok: boolean; result?: T; description?: string };
  try {
    json = JSON.parse(res.body);
  } catch {
    throw new Error(`Telegram ${method}: HTTP ${res.status}`);
  }
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`);
  return json.result as T;
}

/** Скачать файл, присланный боту (голосовое, аудио): getFile → прямая ссылка → байты. */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const f = await tg<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!f.file_path) throw new Error("Telegram не отдал путь к файлу");
  return httpGetBinary(`${API}/file/bot${botToken()}/${f.file_path}`, 30_000);
}

/** Отправить файл по публичной ссылке — Telegram скачает его сам (до 20 МБ). */
export async function sendDocument(chatId: number, documentUrl: string, caption?: string): Promise<void> {
  await tg("sendDocument", { chat_id: chatId, document: documentUrl, ...(caption ? { caption } : {}) });
}

export function splitText(text: string, limit = TG_LIMIT): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n\n", limit);
    if (cut < limit / 2) cut = rest.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit / 2) cut = limit;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Без parse_mode: ответы LLM содержат произвольные символы, разметка Telegram на них падает. */
export async function sendMessage(chatId: number, text: string, markup?: ReplyMarkup): Promise<void> {
  const chunks = splitText(text || "(пусто)");
  for (let i = 0; i < chunks.length; i++) {
    const last = i === chunks.length - 1;
    await tg("sendMessage", {
      chat_id: chatId,
      text: chunks[i],
      disable_web_page_preview: true,
      ...(last && markup ? { reply_markup: markup } : {}),
    });
  }
}

export async function sendTyping(chatId: number): Promise<void> {
  try {
    await tg("sendChatAction", { chat_id: chatId, action: "typing" });
  } catch {}
}

export async function answerCallback(id: string, text?: string): Promise<void> {
  try {
    await tg("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
  } catch {}
}

export async function setMarkup(chatId: number, messageId: number, markup: ReplyMarkup): Promise<void> {
  try {
    await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: markup });
  } catch {
    // «message is not modified» при повторном нажатии — не ошибка
  }
}

/* ── Меню-гармошка: свёрнуто = одна кнопка, развёрнуто = блок действий ── */

export type MenuAction = "ask" | "diagnose" | "log" | "search" | "summarize" | "car" | "records" | "export";

const MENU_ITEMS: { action: MenuAction; label: string }[] = [
  { action: "ask", label: "💬 Спросить" },
  { action: "diagnose", label: "🩺 Диагност" },
  { action: "log", label: "✍️ Записать работу" },
  { action: "search", label: "🔎 Поиск по чату" },
  { action: "summarize", label: "📝 Суммировать" },
  { action: "car", label: "🛠 Моя машина" },
  { action: "records", label: "📋 Записи" },
  { action: "export", label: "⬇️ Выгрузка" },
];

export const ACTION_NAMES: ReadonlySet<string> = new Set(MENU_ITEMS.map((i) => i.action));

export const emptyMarkup: ReplyMarkup = { inline_keyboard: [] };

export function menuCollapsed(): ReplyMarkup {
  return { inline_keyboard: [[{ text: "☰ Меню", callback_data: "menu:open" }]] };
}

export function menuExpanded(): ReplyMarkup {
  const buttons: InlineButton[] = MENU_ITEMS.map((i) => ({ text: i.label, callback_data: `act:${i.action}` }));
  const rows: InlineButton[][] = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([{ text: "▲ Свернуть", callback_data: "menu:close" }]);
  return { inline_keyboard: rows };
}
