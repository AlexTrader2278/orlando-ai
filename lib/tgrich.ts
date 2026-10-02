import { tg, sendMessage, type ReplyMarkup } from "./telegram";

/* «Богатые сообщения» Telegram (Bot API 10.1+): заголовки, списки, таблицы, цитаты, сворачиваемые блоки.
   Формат — Markdown в поле rich_message.markdown, лимит 32768 символов.
   Источник: https://core.telegram.org/bots/api#rich-message-formatting-options */

/** Экранирование недоверенного текста (из базы, чата сообщества), чтобы он не стал разметкой. */
export function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/([`*_\[\]~|<>$#])/g, "\\$1")
    .replace(/==/g, "\\=\\=")
    .replace(/^([-+])(\s)/gm, "\\$1$2")
    .replace(/^(\d+)([.)])(\s)/gm, "$1\\$2$3");
}

/** Ответ нейросети уже содержит Markdown (**жирный**, списки) — пропускаем, но обезвреживаем активную разметку.
    На ответ влияют тексты из чата сообщества (их писали посторонние), поэтому из него нельзя пускать в чат:
    сырой HTML (<tg-button>, <a>, <details>), картинки/медиа и ссылки вида [текст](адрес). Остальное — жирный,
    списки, заголовки — остаётся. «$» гасим, чтобы цены не превращались в формулы. */
export function llmMd(s: string): string {
  return s
    .replace(/\$/g, "\\$")
    .replace(/</g, "\\<")
    .replace(/!\[/g, "!\\[")
    .replace(/\]\(/g, "]\\(");
}

/** Цитата из нескольких строк: «>» нужен перед каждой. */
export function quote(text: string): string {
  return text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `> ${esc(l)}`)
    .join("\n");
}

/** Ячейка таблицы: только строчное форматирование, без переводов строк и вертикальных черт. */
export function cell(s: string): string {
  return esc(s.replace(/\s+/g, " ").trim());
}

/** Запасной вариант без разметки — для старых клиентов или если Telegram отверг rich-формат. */
export function stripRich(md: string): string {
  return md
    .replace(/<\/?details[^>]*>/g, "")
    .replace(/<summary>([\s\S]*?)<\/summary>/g, "$1\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__|~~|==/g, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\|?\s*:?-{2,}:?(\s*\|\s*:?-{2,}:?)*\s*\|?\s*$/gm, "")
    .replace(/\\([\\`*_\[\]~|<>$=#.\-+])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function richEnabled(): boolean {
  return process.env.TELEGRAM_RICH !== "0";
}

export async function sendRich(chatId: number, markdown: string, markup?: ReplyMarkup): Promise<void> {
  if (richEnabled()) {
    try {
      await tg("sendRichMessage", {
        chat_id: chatId,
        rich_message: { markdown },
        ...(markup ? { reply_markup: markup } : {}),
      });
      return;
    } catch (e) {
      console.warn("sendRichMessage не прошёл, шлю обычным текстом:", (e as Error).message.slice(0, 200));
    }
  }
  await sendMessage(chatId, stripRich(markdown), markup);
}

/* ── Чтение входящих «богатых» сообщений (у них нет поля text, есть rich_message.blocks) ── */

type RichNode = string | RichNode[] | { text?: RichNode; blocks?: RichNode[]; items?: RichNode[]; [k: string]: unknown };

function inlineText(n: RichNode | undefined): string {
  if (n == null) return "";
  if (typeof n === "string") return n;
  if (Array.isArray(n)) return n.map(inlineText).join("");
  return inlineText(n.text);
}

function blockText(n: RichNode | undefined): string {
  if (n == null) return "";
  if (typeof n === "string") return n;
  if (Array.isArray(n)) return n.map(blockText).filter(Boolean).join("\n");
  if (n.items) return n.items.map(blockText).filter(Boolean).join("\n");
  if (n.blocks) return n.blocks.map(blockText).filter(Boolean).join("\n");
  return inlineText(n.text);
}

/** Текст сообщения для разбора режима диалога: обычный text, а у rich-сообщения — склейка блоков. */
export function plainOf(msg: { text?: string; rich_message?: { blocks?: unknown[] } } | undefined): string {
  if (!msg) return "";
  if (typeof msg.text === "string") return msg.text;
  if (msg.rich_message?.blocks) return blockText(msg.rich_message.blocks as RichNode[]);
  return "";
}
