import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizedMessage, RawMessage } from "../lib/types.js";

const INPUT = process.env.INPUT ??
  "C:\\Users\\user\\Downloads\\Telegram Desktop\\ChatExport_2026-05-07 (2)\\result.json";
const OUTPUT = resolve("data/messages.jsonl");

const MIN_TEXT_LEN = 30;

const INTRO_PATTERNS = [
  /^привет[\s.,!]*[а-яё\s]{0,40}$/i,
  /^всем\s+привет/i,
  /^здравствуйте/i,
  /^добр(ый|ого)\s+(день|вечер|утра|утро)/i,
];

function extractText(raw: RawMessage): string {
  if (typeof raw.text === "string") return raw.text;
  if (Array.isArray(raw.text_entities)) {
    return raw.text_entities.map((e) => e.text).join("");
  }
  if (Array.isArray(raw.text)) {
    return raw.text
      .map((part) => (typeof part === "string" ? part : (part as { text?: string }).text ?? ""))
      .join("");
  }
  return "";
}

function isIntroduction(text: string): boolean {
  const t = text.trim();
  if (t.length > 80) return false;
  return INTRO_PATTERNS.some((re) => re.test(t));
}

function isOnlyEmoji(text: string): boolean {
  const stripped = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]/gu, "");
  return stripped.length === 0;
}

function countReactions(raw: RawMessage): { total: number; byEmoji: Record<string, number> } {
  const byEmoji: Record<string, number> = {};
  let total = 0;
  for (const r of raw.reactions ?? []) {
    total += r.count;
    if (r.emoji) byEmoji[r.emoji] = (byEmoji[r.emoji] ?? 0) + r.count;
  }
  return { total, byEmoji };
}

function normalize(raw: RawMessage): NormalizedMessage | null {
  if (raw.type !== "message") return null;
  if (!raw.from || !raw.from_id) return null;

  const text = extractText(raw).trim();
  if (!text) return null;
  if (text.length < MIN_TEXT_LEN) return null;
  if (isOnlyEmoji(text)) return null;
  if (isIntroduction(text)) return null;

  const { total, byEmoji } = countReactions(raw);
  const hasMedia = Boolean(raw.photo || raw.file || raw.media_type);

  return {
    id: raw.id,
    date: raw.date,
    ts: Number(raw.date_unixtime),
    author: raw.from,
    authorId: raw.from_id,
    text,
    replyTo: raw.reply_to_message_id ?? null,
    reactionsTotal: total,
    reactionsByEmoji: byEmoji,
    hasMedia,
  };
}

function main() {
  console.log(`Reading ${INPUT} ...`);
  const raw = JSON.parse(readFileSync(INPUT, "utf-8")) as { messages: RawMessage[] };
  const total = raw.messages.length;
  console.log(`Total messages: ${total}`);

  const stats = {
    total,
    services: 0,
    empty: 0,
    tooShort: 0,
    onlyEmoji: 0,
    intros: 0,
    kept: 0,
  };

  const out: string[] = [];

  for (const m of raw.messages) {
    if (m.type !== "message") {
      stats.services++;
      continue;
    }
    const text = extractText(m).trim();
    if (!text) {
      stats.empty++;
      continue;
    }
    if (isOnlyEmoji(text)) {
      stats.onlyEmoji++;
      continue;
    }
    if (text.length < MIN_TEXT_LEN) {
      stats.tooShort++;
      continue;
    }
    if (isIntroduction(text)) {
      stats.intros++;
      continue;
    }

    const normalized = normalize(m);
    if (!normalized) continue;
    stats.kept++;
    out.push(JSON.stringify(normalized));
  }

  writeFileSync(OUTPUT, out.join("\n") + "\n", "utf-8");

  console.log("\n=== Stats ===");
  console.table(stats);
  console.log(`\nWrote ${stats.kept} messages → ${OUTPUT}`);
}

main();
