import { askOrlando } from "./ask";
import { summarizeFindings } from "./summarize";
import { diagnose, MAX_SYMPTOM_CHARS, type DiagnoseResult } from "./diagnose";
import {
  getServiceRecords,
  getServiceRecord,
  buildSummary,
  insertServiceRecord,
  updateServiceRecord,
  deleteServiceRecord,
  type ServiceRecord,
} from "./car";
import { parseFreeText, applyEdit, validateParsedRecord, type ParsedRecord } from "./parse-record";
import { savePending, takePending, UUID_RE } from "./bot-pending";
import { embed } from "./mistral";
import { rpcSearchThreads } from "./supabase-rest";
import {
  sendMessage,
  sendDocument,
  downloadFile,
  sendTyping,
  answerCallback,
  setMarkup,
  menuCollapsed,
  menuExpanded,
  emptyMarkup,
  ACTION_NAMES,
  type MenuAction,
  type InlineButton,
  type ReplyMarkup,
} from "./telegram";
import { sendRich, plainOf, esc, llmMd, quote, cell } from "./tgrich";

type RichBits = { text?: string; rich_message?: { blocks?: unknown[] } };
type TgUser = { id: number };
type TgMedia = { file_id: string; duration?: number; file_size?: number; mime_type?: string };
type TgMessage = RichBits & {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  reply_to_message?: RichBits;
  voice?: TgMedia;
  audio?: TgMedia;
};
type TgCallback = {
  id: string;
  from: TgUser;
  data?: string;
  message?: RichBits & { message_id: number; chat: { id: number } };
};
export type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: TgCallback };

const MAX_QUESTION = 1000;
const MAX_SUMMARY_QUERY = 300;
const LIST_LIMIT = 8;
const MAX_VOICE_SECONDS = 60;
const MAX_VOICE_BYTES = 2_000_000;

/* Режим диалога без базы: подсказка бота уходит с force_reply, а по ПЕРВОЙ строке сообщения, на которое
   ответил владелец, узнаём, что он хочет. Заголовок = часть строки до «·» без эмодзи и знаков, сравнивается
   ТОЧНО: обычный ответ AI, начинающийся словом «Диагностика…», режимом не считается.
   Всё после «·» — полезная нагрузка (эхо симптома или запроса). */
const HEAD_SEARCH = "Поиск по чату";
const HEAD_SUMMARIZE = "Суммировать";
const HEAD_DIAGNOSE = "Диагност";
const HEAD_LOG = "Записать работу";
const HEAD_EDIT = "Исправить запись";
const HEAD_PREVIEWS = new Set(["Проверь запись", "Проверь правку"]);

function headingOf(firstLine: string): string {
  return (firstLine.split("·")[0] ?? "").replace(/[^A-Za-zА-Яа-яЁё0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

const ECHO_RE = /·\s*«(.*)»\s*$/;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isOwner(userId: number | undefined): boolean {
  const owner = process.env.TELEGRAM_OWNER_ID?.trim();
  return Boolean(owner) && userId !== undefined && String(userId) === owner;
}

function ruDate(iso: string): string {
  return iso.slice(0, 10).split("-").reverse().join(".");
}

function fmtKm(km: number | null): string {
  return km != null ? `${km.toLocaleString("ru-RU")} км` : "—";
}

function fmtRub(v: number | null): string {
  return v != null ? `${v.toLocaleString("ru-RU")} ₽` : "—";
}

function partLabel(p: ParsedRecord["parts"][number]): string {
  return `${p.brand ?? ""} ${p.name}${p.article ? ` (${p.article})` : ""}`.trim();
}

async function reportError(chatId: number, e: unknown): Promise<void> {
  const msg = (e as Error).message ?? String(e);
  console.error("bot error:", msg);
  const text = msg.startsWith("OpenRouter 401")
    ? "⚠️ Нейросеть не приняла ключ на сервере (OpenRouter 401). Это настройка сервера, не твоя ошибка."
    : `⚠️ Ошибка: ${msg.slice(0, 300)}`;
  await sendMessage(chatId, text, menuCollapsed());
}

/* ── Оформление (rich-Markdown) ── */

type SourceLike = { text: string; start_date: string; message_count: number; reactions_total: number };

/** Источники из чата — сворачиваемый блок, чтобы не раздувать ответ. */
function mdSources(sources: SourceLike[]): string {
  if (sources.length === 0) return "";
  const items = sources.slice(0, 3).map((s) => {
    const snippet = s.text.replace(/\s+/g, " ").slice(0, 200);
    const likes = s.reactions_total > 0 ? ` · ❤ ${s.reactions_total}` : "";
    return `> **${ruDate(s.start_date)}** · ${s.message_count} сообщ.${likes}\n> ${esc(snippet)}…`;
  });
  return `\n\n<details><summary>📚 Из чата сообщества (${items.length})</summary>\n\n${items.join("\n\n")}\n\n</details>`;
}

function mdAnswer(answer: string, sources: SourceLike[]): string {
  return `${llmMd(answer)}${mdSources(sources)}`;
}

function mdCar(records: ServiceRecord[]): string {
  const s = buildSummary(records);
  if (s.totalRecords === 0) return "## 🛠 Моя машина\n\nИстория пуста. Добавь первую работу через «✍️ Записать работу».";
  const works = s.lastWorks.map((w) => `- ${esc(w)}`).join("\n");
  return `## 🛠 Моя машина\n\n| Показатель | Значение |\n|:--|--:|\n| 🛣 Пробег | **${fmtKm(s.currentMileage)}** |\n| 📋 Записей в книжке | **${s.totalRecords}** |\n\n### Последняя работа · ${s.lastDate ? ruDate(s.lastDate) : "—"}\n${works}`;
}

function mdRecordsList(records: ServiceRecord[]): string {
  const rows = records.slice(0, LIST_LIMIT).map((r, i) => {
    const works = cell(r.works.slice(0, 3).join("; ") + (r.works.length > 3 ? ` (+${r.works.length - 3})` : ""));
    return `| ${i + 1} | ${ruDate(r.date)} | ${r.mileage_km != null ? r.mileage_km.toLocaleString("ru-RU") : "—"} | ${works} | ${r.cost_total != null ? r.cost_total.toLocaleString("ru-RU") : "—"} |`;
  });
  return `## 📋 Последние записи (${Math.min(LIST_LIMIT, records.length)} из ${records.length})\n\n| № | Дата | Пробег, км | Что делали | Сумма, ₽ |\n|--:|:--|--:|:--|--:|\n${rows.join("\n")}\n\n✏️ — исправить, 🗑 — удалить (номер кнопки = номер записи).`;
}

function recordsKeyboard(records: ServiceRecord[]): ReplyMarkup {
  const rows: InlineButton[][] = [];
  const shown = records.slice(0, LIST_LIMIT);
  for (let i = 0; i < shown.length; i += 2) {
    const row: InlineButton[] = [];
    for (const j of [i, i + 1]) {
      if (!shown[j]) continue;
      row.push({ text: `✏️ ${j + 1}`, callback_data: `rec:edit:${shown[j].id}` });
      row.push({ text: `🗑 ${j + 1}`, callback_data: `rec:del:${shown[j].id}` });
    }
    rows.push(row);
  }
  return { inline_keyboard: rows };
}

/** Простой текст — для подтверждения удаления и коротких сообщений. */
function plainRecordBody(r: ParsedRecord): string {
  const lines: string[] = [];
  lines.push(`📅 ${ruDate(r.date)} · ${r.mileage_km != null ? `🛣 ${fmtKm(r.mileage_km)}` : "пробег не указан"}`);
  for (const w of r.works) lines.push(`• ${w}`);
  if (r.parts.length > 0) lines.push(`🛠 ${r.parts.map(partLabel).join(", ")}`);
  if (r.cost_total != null) lines.push(`💰 ${fmtRub(r.cost_total)}`);
  if (r.notes) lines.push(`📝 ${r.notes}`);
  return lines.join("\n");
}

function mdRecordBody(r: ParsedRecord): string {
  const lines: string[] = [];
  lines.push(`**📅 ${ruDate(r.date)}** · ${r.mileage_km != null ? `🛣 ${fmtKm(r.mileage_km)}` : "_пробег не указан_"}`);
  if (r.works.length > 0) lines.push(r.works.map((w) => `- ${esc(w)}`).join("\n"));
  if (r.parts.length > 0) lines.push(`🛠 ${esc(r.parts.map(partLabel).join(", "))}`);
  if (r.cost_total != null) lines.push(`💰 **${fmtRub(r.cost_total)}**`);
  if (r.notes) lines.push(`📝 ${esc(r.notes)}`);
  return lines.join("\n\n");
}

function toParsed(r: ServiceRecord): ParsedRecord {
  return {
    date: r.date,
    mileage_km: r.mileage_km,
    works: r.works ?? [],
    materials: r.materials ?? [],
    parts: r.parts ?? [],
    cost_works: r.cost_works,
    cost_materials: r.cost_materials,
    cost_total: r.cost_total,
    notes: r.notes,
  };
}

function mdDiff(oldR: ParsedRecord, newR: ParsedRecord): string {
  const out: string[] = [];
  if (oldR.date !== newR.date) out.push(`- 📅 дата: ${ruDate(oldR.date)} → **${ruDate(newR.date)}**`);
  if (oldR.mileage_km !== newR.mileage_km) out.push(`- 🛣 пробег: ${fmtKm(oldR.mileage_km)} → **${fmtKm(newR.mileage_km)}**`);
  if (oldR.works.join("; ") !== newR.works.join("; ")) {
    out.push(`- 🔧 работы: было ${esc(oldR.works.join("; ") || "—")} → **${esc(newR.works.join("; ") || "—")}**`);
  }
  if (oldR.parts.map(partLabel).join("; ") !== newR.parts.map(partLabel).join("; ")) {
    out.push(`- 🛠 детали: было ${esc(oldR.parts.map(partLabel).join("; ") || "—")} → **${esc(newR.parts.map(partLabel).join("; ") || "—")}**`);
  }
  if (oldR.cost_total !== newR.cost_total) out.push(`- 💰 сумма: ${fmtRub(oldR.cost_total)} → **${fmtRub(newR.cost_total)}**`);
  if ((oldR.notes ?? "") !== (newR.notes ?? "")) out.push(`- 📝 заметка: ${esc(oldR.notes ?? "—")} → **${esc(newR.notes ?? "—")}**`);
  const body = out.length > 0 ? out.join("\n") : "_Изменений не видно — запись осталась прежней._";
  return `### Что изменится\n${body}`;
}

const SEVERITY: Record<DiagnoseResult["severity"], string> = {
  ok: "🟢 Можно ездить и наблюдать",
  soon: "🟡 Запишись к мастеру в ближайшее время",
  urgent: "🔴 Лучше не ездить — покажи мастеру срочно",
};
const CONFIDENCE: Record<DiagnoseResult["causes"][number]["confidence"], string> = {
  high: "вероятно",
  med: "возможно",
  low: "менее вероятно",
};

function mdDiagnosis(symptom: string, d: DiagnoseResult): string {
  const parts: string[] = [];
  // Первая строка — «эхо» симптома: по ней при ответе на это сообщение восстанавливаем исходное описание.
  parts.push(`## 🩺 Диагност · «${esc(symptom)}»`);
  parts.push(`**${SEVERITY[d.severity]}**`);
  if (d.soundDescription) parts.push(`### 🔊 Что услышал AI\n${esc(d.soundDescription)}`);
  if (d.soundError) parts.push(`> ⚠️ ${esc(d.soundError)}`);
  if (d.uncertain && d.questions.length > 0) {
    parts.push(`### ❓ Данных маловато\nОтветь на это сообщение, дополнив описание:\n${d.questions.map((q) => `- ${esc(q)}`).join("\n")}`);
  }
  if (d.causes.length > 0) {
    const causes = d.causes.map((c, i) => `${i + 1}. **${esc(c.name)}** — _${CONFIDENCE[c.confidence]}_${c.why ? `. ${esc(c.why)}` : ""}`);
    parts.push(`### Вероятные причины\n${causes.join("\n")}`);
  }
  if (d.checks.length > 0) parts.push(`### 🔧 Проверь сам\n${d.checks.map((c) => `- ${esc(c)}`).join("\n")}`);
  parts.push("> ⚠️ Это триаж по описанию, а не вердикт мастера. Красный статус — покажи машину специалисту.");
  if (!d.uncertain) parts.push("_Хочешь уточнить — ответь на это сообщение: допишу к описанию и разберу заново._");
  return parts.join("\n\n") + mdSources(d.sources);
}

function mdPreview(title: string, rec: ParsedRecord, diff?: string): string {
  const hint = rec.mileage_km == null ? "\n\n💡 _Пробег не указан — счётчик «км пробег» не изменится._" : "";
  return `## ✍️ ${title}\n\n> ⚠️ **ЕЩЁ НЕ СОХРАНЕНО** — проверь и нажми «✓ Сохранить».\n\n${diff ? `${diff}\n\n` : ""}${mdRecordBody(rec)}${hint}`;
}

function previewButtons(pendingId: string): ReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✓ Сохранить", callback_data: `rec:save:${pendingId}` },
        { text: "✗ Отмена", callback_data: `rec:cancel:${pendingId}` },
      ],
    ],
  };
}

/* ── Сценарии ── */

async function runAsk(chatId: number, question: string): Promise<void> {
  if (question.length < 5) {
    await sendMessage(chatId, "Слишком коротко — опиши вопрос подробнее.", menuCollapsed());
    return;
  }
  await sendTyping(chatId);
  const r = await askOrlando(question.slice(0, MAX_QUESTION));
  await sendRich(chatId, mdAnswer(r.answer, r.sources), menuCollapsed());
}

async function runSummarize(chatId: number, topic: string): Promise<void> {
  if (topic.length < 2) {
    await sendMessage(chatId, "Слишком коротко — назови тему.", menuCollapsed());
    return;
  }
  await sendTyping(chatId);
  const r = await summarizeFindings(topic.slice(0, MAX_SUMMARY_QUERY));
  await sendRich(chatId, mdAnswer(r.answer, r.sources), menuCollapsed());
}

// В эхо первой строки не должно быть переводов строк и угловых кавычек — по ним потом разбираем сообщение.
function cleanText(s: string): string {
  return s.replace(/[«»]/g, '"').replace(/\s+/g, " ").trim();
}

const SEARCH_PAGE = 3;
const SEARCH_TOTAL = 15;

/** Поиск без нейросети: эмбеддинг запроса + гибридный поиск по базе, показ самих обсуждений по 3 штуки. */
async function runSearch(chatId: number, rawQuery: string, offset = 0): Promise<void> {
  const query = cleanText(rawQuery).slice(0, MAX_SUMMARY_QUERY);
  if (query.length < 2) {
    await sendMessage(chatId, "Слишком коротко — напиши, что искать.", menuCollapsed());
    return;
  }
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not set");

  await sendTyping(chatId);
  const { embeddings } = await embed([query], apiKey);
  const found = await rpcSearchThreads(`[${embeddings[0].join(",")}]`, query, SEARCH_TOTAL);
  if (found.length === 0) {
    await sendMessage(chatId, "Ничего не нашёл. Попробуй другие слова.", menuCollapsed());
    return;
  }
  const page = found.slice(offset, offset + SEARCH_PAGE);
  if (page.length === 0) {
    await sendMessage(chatId, "Больше обсуждений по этому запросу нет.", menuCollapsed());
    return;
  }
  const blocks = page.map((t, i) => {
    const likes = t.reactions_total > 0 ? ` · ❤ ${t.reactions_total}` : "";
    const body = t.text.length > 800 ? `${t.text.slice(0, 800)}…` : t.text;
    return `### ${offset + i + 1}) ${ruDate(t.start_date)} · ${t.message_count} сообщ. · ${t.participants_count} участн.${likes}\n${quote(body)}`;
  });
  const to = offset + page.length;
  const header = `## 🔎 Поиск по чату · «${esc(query)}»\nНайдено ${found.length}, показаны ${offset + 1}–${to}. _Чтобы искать другое — ответь на это сообщение._`;
  const more = to < found.length;
  await sendRich(
    chatId,
    `${header}\n\n${blocks.join("\n\n")}`,
    more
      ? { inline_keyboard: [[{ text: `Ещё ▶ (${to + 1}–${Math.min(to + SEARCH_PAGE, found.length)})`, callback_data: `srch:${to}` }]] }
      : menuCollapsed()
  );
}

async function runDiagnose(chatId: number, rawSymptom: string): Promise<void> {
  let symptom = cleanText(rawSymptom);
  if (symptom.length > MAX_SYMPTOM_CHARS) symptom = symptom.slice(-MAX_SYMPTOM_CHARS);
  if (symptom.length < 5) {
    await sendMessage(chatId, "Слишком коротко — опиши, что слышно/чувствуется, где и когда.", menuCollapsed());
    return;
  }
  await sendTyping(chatId);
  const d = await diagnose(symptom);
  await sendRich(chatId, mdDiagnosis(symptom, d), menuCollapsed());
}

function audioFormat(media: TgMedia, isVoice: boolean): string {
  if (isVoice) return "ogg"; // голосовые Telegram — всегда OGG/Opus; модель принимает без конвертации
  const mt = (media.mime_type ?? "").toLowerCase();
  if (mt.includes("wav")) return "wav";
  if (mt.includes("ogg") || mt.includes("opus")) return "ogg";
  if (mt.includes("mp4") || mt.includes("m4a") || mt.includes("aac")) return "m4a";
  return "mp3";
}

/** Голосовое/аудио в чат = диагностика по звуку. Если ответили на результат диагноза — описание дополняется. */
async function runVoice(chatId: number, m: TgMessage): Promise<void> {
  const media = m.voice ?? m.audio;
  if (!media) return;
  if ((media.duration ?? 0) > MAX_VOICE_SECONDS || (media.file_size ?? 0) > MAX_VOICE_BYTES) {
    await sendMessage(chatId, "Запись слишком длинная. Запиши покороче: 10–15 секунд у источника звука достаточно.", menuCollapsed());
    return;
  }
  const firstLine = plainOf(m.reply_to_message).split("\n")[0] ?? "";
  const prior = headingOf(firstLine) === HEAD_DIAGNOSE ? (firstLine.match(ECHO_RE)?.[1] ?? "") : "";

  await sendTyping(chatId);
  const buf = await downloadFile(media.file_id);
  if (buf.length > MAX_VOICE_BYTES) {
    await sendMessage(chatId, "Файл слишком большой. Запиши покороче: 10–15 секунд достаточно.", menuCollapsed());
    return;
  }
  const d = await diagnose(prior, { data: buf.toString("base64"), format: audioFormat(media, Boolean(m.voice)) });
  const heard = d.soundDescription ? `🎤 ${cleanText(d.soundDescription).slice(0, 250)}` : "🎤 звук";
  await sendRich(chatId, mdDiagnosis([prior, heard].filter(Boolean).join(" + "), d), menuCollapsed());
}

async function runExport(chatId: number): Promise<void> {
  const base = (process.env.PUBLIC_URL ?? "https://orlando-ai.vercel.app").replace(/\/$/, "");
  try {
    await sendDocument(chatId, `${base}/api/export?format=csv`, "📊 Книжка для Excel (CSV)");
    await sendDocument(chatId, `${base}/api/export?format=json`, "💾 Полный бэкап (JSON)");
    await sendMessage(chatId, "Готово ✓ Два файла выше.", menuCollapsed());
  } catch (e) {
    console.error("bot export:", (e as Error).message);
    await sendMessage(
      chatId,
      `Не получилось прислать файлы. Скачай по ссылкам:\n${base}/api/export?format=csv\n${base}/api/export?format=json`,
      menuCollapsed()
    );
  }
}

async function runLogPreview(chatId: number, text: string): Promise<void> {
  if (text.length < 5) {
    await sendMessage(chatId, "Слишком коротко — опиши, что сделали, пробег и сумму.", menuCollapsed());
    return;
  }
  await sendTyping(chatId);
  const parsed = await parseFreeText(text, today());
  const v = validateParsedRecord(parsed, today());
  if (!v.ok) {
    await sendMessage(chatId, `Не распозналось: ${v.error}. Поправь текст и пришли снова.`, menuCollapsed());
    return;
  }
  const id = await savePending(chatId, "add", { record: v.record });
  await sendRich(chatId, mdPreview("Проверь запись", v.record), previewButtons(id));
}

async function runEditPreview(chatId: number, recordId: string, instruction: string): Promise<void> {
  if (!UUID_RE.test(recordId)) {
    await sendMessage(chatId, "Не нашёл, какую запись править. Открой «📋 Записи» и нажми ✏️ у нужной.", menuCollapsed());
    return;
  }
  const existing = await getServiceRecord(recordId);
  if (!existing) {
    await sendMessage(chatId, "Такой записи уже нет (возможно, удалена).", menuCollapsed());
    return;
  }
  await sendTyping(chatId);
  const oldParsed = toParsed(existing);
  const edited = await applyEdit(oldParsed, instruction, today());
  const v = validateParsedRecord(edited, today());
  if (!v.ok) {
    await sendMessage(chatId, `Правка не получилась: ${v.error}. Сформулируй иначе и пришли снова.`, menuCollapsed());
    return;
  }
  const id = await savePending(chatId, "edit", { record: v.record, recordId });
  await sendRich(chatId, mdPreview("Проверь правку", v.record, mdDiff(oldParsed, v.record)), previewButtons(id));
}

async function runAction(chatId: number, action: MenuAction): Promise<void> {
  // Подсказки с force_reply — обычным текстом: по их первой строке бот узнаёт режим ответа.
  const forceReply = (text: string, placeholder: string) =>
    sendMessage(chatId, text, { force_reply: true, input_field_placeholder: placeholder });

  switch (action) {
    case "ask":
      return forceReply("💬 Спросить\nНапиши вопрос в ответ на это сообщение.", "Например: пора ли менять масло?");
    case "search":
      return forceReply(
        "🔎 Поиск по чату\nО чём искать в обсуждениях владельцев? Ответь на это сообщение — пришлю сами обсуждения, без нейросети.",
        "Например: стук в подвеске на холодную"
      );
    case "summarize":
      return forceReply(
        "📝 Суммировать\nПо какой теме собрать находки из чата? Ответь на это сообщение.",
        "Например: стук в подвеске"
      );
    case "diagnose":
      return forceReply(
        "🩺 Диагност\nОпиши симптом: что слышно или чувствуется, где и когда (холодный мотор, поворот, скорость). Ответь на это сообщение.",
        "Например: стук спереди на мелких кочках"
      );
    case "log":
      return forceReply(
        "✍️ Записать работу\nОпиши по-русски: что сделали, пробег, сумму. Ответь на это сообщение — сначала покажу, что понял, в базу пишу только после «✓ Сохранить».",
        "Например: поменял масло 5w30 4л, пробег 198500, 3200 р"
      );
    case "export":
      await sendTyping(chatId);
      return runExport(chatId);
    case "car":
      await sendTyping(chatId);
      await sendRich(chatId, mdCar(await getServiceRecords(50)), menuCollapsed());
      return;
    case "records": {
      await sendTyping(chatId);
      const records = await getServiceRecords(50);
      if (records.length === 0) {
        await sendMessage(chatId, "📋 Записей пока нет.", menuCollapsed());
        return;
      }
      await sendRich(chatId, mdRecordsList(records), recordsKeyboard(records));
      return;
    }
  }
}

/* ── Кнопки записей ── */

async function handleRecordCallback(chatId: number, messageId: number, parts: string[]): Promise<void> {
  const [, action, id] = parts;

  if (action === "save" || action === "cancel") {
    const pending = await takePending(id ?? "", chatId);
    await setMarkup(chatId, messageId, emptyMarkup);
    if (!pending) {
      await sendMessage(chatId, "Это превью уже обработано или устарело. Отправь запись заново.", menuCollapsed());
      return;
    }
    if (action === "cancel") {
      await sendMessage(chatId, "Отменено. Ничего не сохранено.", menuCollapsed());
      return;
    }
    const v = validateParsedRecord(pending.payload.record, today());
    if (!v.ok) {
      await sendMessage(chatId, `Не сохранил: ${v.error}.`, menuCollapsed());
      return;
    }
    const r = v.record;
    const fields = {
      date: r.date,
      mileage_km: r.mileage_km,
      works: r.works,
      materials: r.materials,
      parts: r.parts,
      cost_works: r.cost_works,
      cost_materials: r.cost_materials,
      cost_total: r.cost_total,
      notes: r.notes,
    };
    if (pending.kind === "edit" && pending.payload.recordId && UUID_RE.test(pending.payload.recordId)) {
      await updateServiceRecord(pending.payload.recordId, fields);
      await sendMessage(chatId, "✓ Запись исправлена. AI теперь учитывает новую версию.", menuCollapsed());
    } else {
      await insertServiceRecord({ ...fields, source: "telegram" });
      await sendMessage(chatId, "✓ Записано. AI теперь это учитывает.", menuCollapsed());
    }
    return;
  }

  if (action === "edit") {
    if (!id || !UUID_RE.test(id)) return;
    const rec = await getServiceRecord(id);
    if (!rec) {
      await sendMessage(chatId, "Такой записи уже нет (возможно, удалена).", menuCollapsed());
      return;
    }
    const brief = `${ruDate(rec.date)} · ${fmtKm(rec.mileage_km)} — ${rec.works[0] ?? "без названия"}`;
    await sendMessage(
      chatId,
      `✏️ Исправить запись\n${brief}\nНапиши, что поменять: например «пробег 199000» или «добавь: заменил свечи». Ответь на это сообщение.\nid: ${id}`,
      { force_reply: true, input_field_placeholder: "Что исправить?" }
    );
    return;
  }

  if (action === "del") {
    if (!id || !UUID_RE.test(id)) return;
    const rec = await getServiceRecord(id);
    if (!rec) {
      await sendMessage(chatId, "Такой записи уже нет.", menuCollapsed());
      return;
    }
    await sendMessage(chatId, `🗑 Удалить эту запись? Это необратимо.\n\n${plainRecordBody(toParsed(rec))}`, {
      inline_keyboard: [
        [
          { text: "Да, удалить", callback_data: `rec:delok:${id}` },
          { text: "Не удалять", callback_data: "rec:delno" },
        ],
      ],
    });
    return;
  }

  if (action === "delok") {
    await setMarkup(chatId, messageId, emptyMarkup);
    if (!id || !UUID_RE.test(id)) return;
    const rec = await getServiceRecord(id);
    if (!rec) {
      await sendMessage(chatId, "Такой записи уже нет.", menuCollapsed());
      return;
    }
    await deleteServiceRecord(id);
    await sendMessage(chatId, "🗑 Запись удалена.", menuCollapsed());
    return;
  }

  if (action === "delno") {
    await setMarkup(chatId, messageId, emptyMarkup);
    await sendMessage(chatId, "Не удаляю.", menuCollapsed());
  }
}

async function handleCallback(cb: TgCallback): Promise<void> {
  if (!isOwner(cb.from.id)) {
    await answerCallback(cb.id, "Доступ закрыт");
    return;
  }
  await answerCallback(cb.id);
  const msg = cb.message;
  if (!msg || !cb.data) return;
  const chatId = msg.chat.id;
  const parts = cb.data.split(":");

  try {
    if (cb.data === "menu:open") return await setMarkup(chatId, msg.message_id, menuExpanded());
    if (cb.data === "menu:close") return await setMarkup(chatId, msg.message_id, menuCollapsed());
    if (parts[0] === "act") {
      const action = parts[1];
      if (!ACTION_NAMES.has(action)) return;
      await setMarkup(chatId, msg.message_id, menuCollapsed());
      return await runAction(chatId, action as MenuAction);
    }
    if (parts[0] === "rec") return await handleRecordCallback(chatId, msg.message_id, parts);
    if (parts[0] === "srch") {
      const offset = Number(parts[1]);
      const query = plainOf(msg).split("\n")[0]?.match(ECHO_RE)?.[1];
      if (!Number.isInteger(offset) || offset < 0 || offset >= SEARCH_TOTAL || !query) return;
      await setMarkup(chatId, msg.message_id, emptyMarkup);
      return await runSearch(chatId, query, offset);
    }
  } catch (e) {
    await reportError(chatId, e);
  }
}

async function handleMessage(m: TgMessage): Promise<void> {
  const hasAudio = Boolean(m.voice ?? m.audio);
  if (m.chat.type !== "private" || (!m.text && !hasAudio)) return;
  const chatId = m.chat.id;
  const text = (m.text ?? "").trim();

  if (!process.env.TELEGRAM_OWNER_ID?.trim()) {
    if (text.startsWith("/start")) {
      await sendMessage(chatId, `Бот ещё не настроен. Твой Telegram id: ${m.from?.id}. Его нужно записать в TELEGRAM_OWNER_ID.`);
    }
    return;
  }
  if (!isOwner(m.from?.id)) {
    await sendMessage(chatId, "Это личный бот владельца Chevrolet Orlando. Доступ закрыт.");
    return;
  }

  if (text.startsWith("/start") || text.startsWith("/menu")) {
    await sendMessage(
      chatId,
      "🚗 Орландо-Механик\nВыбери действие или просто напиши вопрос — отвечу как в «Спросить».\n🎤 Пришли голосовое со звуком мотора — разберу его в «Диагносте».",
      menuExpanded()
    );
    return;
  }

  if (hasAudio) {
    try {
      return await runVoice(chatId, m);
    } catch (e) {
      await reportError(chatId, e);
      return;
    }
  }

  try {
    const replied = plainOf(m.reply_to_message);
    if (m.reply_to_message && !replied) {
      // Диагностика формата: ответ на сообщение, из которого не удалось достать текст.
      console.warn("bot: reply_to_message без текста:", JSON.stringify(m.reply_to_message).slice(0, 600));
    }
    const firstLine = replied.split("\n")[0] ?? "";
    const head = headingOf(firstLine);

    if (head === HEAD_SEARCH) return await runSearch(chatId, text);

    if (head === HEAD_SUMMARIZE) return await runSummarize(chatId, text);

    if (head === HEAD_DIAGNOSE) {
      // Ответ на результат диагноза: исходный симптом лежит в эхо первой строки «🩺 Диагност · «…»».
      const echo = firstLine.match(ECHO_RE)?.[1] ?? "";
      return await runDiagnose(chatId, echo ? `${echo} ${text}` : text);
    }

    if (head === HEAD_EDIT) {
      const id = replied.match(/id:\s*([0-9a-f-]{36})/i)?.[1] ?? "";
      return await runEditPreview(chatId, id, text);
    }

    if (HEAD_PREVIEWS.has(head)) {
      await sendMessage(
        chatId,
        "Под превью нажми «✓ Сохранить» или «✗ Отмена». Чтобы переписать — отмени и пришли запись заново через меню.",
        menuCollapsed()
      );
      return;
    }

    if (head === HEAD_LOG) return await runLogPreview(chatId, text);

    // «Спросить», обычное сообщение и ответ на любое другое сообщение бота — вопрос к AI.
    return await runAsk(chatId, text);
  } catch (e) {
    await reportError(chatId, e);
  }
}

export async function handleUpdate(u: TgUpdate): Promise<void> {
  if (u.callback_query) return handleCallback(u.callback_query);
  if (u.message) return handleMessage(u.message);
}
