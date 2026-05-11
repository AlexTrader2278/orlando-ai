import { embed } from "./mistral";
import { rpcSearchThreads, type SearchResult } from "./supabase-rest";
import { chat } from "./openrouter";
import { getServiceRecords, formatHistoryForPrompt } from "./car";

const TOP_K_FOR_LLM = 8;

const SYSTEM_PROMPT = `Ты — AI-ассистент владельца Chevrolet Orlando. Отвечаешь на русском.

У тебя ТРИ источника:
1) Твои общие знания о Chevrolet Orlando (двигатели 1.8 LUW, 2.0 дизель, АКПП 6T40, цепь ГРМ, типичные болезни).
2) Цитаты из чата сообщества владельцев — реальный опыт с пробегами, артикулами, ценами.
3) ИСТОРИЯ КОНКРЕТНО ЭТОЙ МАШИНЫ — что и когда уже делали, на каком пробеге.

ПРАВИЛА:
- Если в вопросе есть привязка к "у меня / моей машине / пора ли / делал ли я" — ОПИРАЙСЯ на историю машины. Считай по факту: «масло меняли N км назад, ехать ещё ~X км».
- Сначала экспертный ответ кратко и по делу (2–4 абзаца). Если уместно — упомяни персональную историю.
- Затем блок «💬 Что пишут владельцы:» — 3–5 цитат из чата сообщества с источниками: «выдержка» — [Имя, дата, реакции].
- В цитатах используй ТОЛЬКО предоставленные треды. Не выдумывай.
- Если в тредах ответа нет — честно скажи.
- Не пиши «тред #5» или «источник 3» — пиши обычным текстом.`;

function buildContext(threads: SearchResult[]): string {
  return threads
    .slice(0, TOP_K_FOR_LLM)
    .map((t, i) => {
      const date = t.start_date.slice(0, 10);
      const truncated = t.text.length > 1500 ? t.text.slice(0, 1500) + "…" : t.text;
      return `--- ИСТОЧНИК ${i + 1} (дата: ${date}, сообщений: ${t.message_count}, реакций: ${t.reactions_total}) ---\n${truncated}`;
    })
    .join("\n\n");
}

export type AskAnswer = {
  answer: string;
  sources: SearchResult[];
  tokensUsed: { embed: number; chat: number };
};

export async function askOrlando(question: string): Promise<AskAnswer> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not set");

  // 1) embed запроса + поиск по чату сообщества
  const { embeddings, tokensUsed: embedTokens } = await embed([question], apiKey);
  const queryEmbedding = `[${embeddings[0].join(",")}]`;
  const sources = await rpcSearchThreads(queryEmbedding, question, 15);

  // 2) персональная история машины — короткий список последних работ
  let historyBlock = "";
  try {
    const records = await getServiceRecords(30);
    historyBlock = formatHistoryForPrompt(records);
  } catch {
    // если таблицы пока нет (миграция не применена) — не падаем, просто без истории
    historyBlock = "";
  }

  if (sources.length === 0 && !historyBlock) {
    return {
      answer:
        "В базе сообщества по этому вопросу обсуждений не нашлось, и истории машины ещё нет. Попробуй переформулировать или добавить пару записей о работах.",
      sources: [],
      tokensUsed: { embed: embedTokens, chat: 0 },
    };
  }

  const context = sources.length > 0 ? buildContext(sources) : "(в чате сообщества подходящих обсуждений не нашлось)";
  const historyText = historyBlock ? `\n\n${historyBlock}` : "";
  const userPrompt = `ВОПРОС:\n${question}${historyText}\n\nЦИТАТЫ ИЗ ЧАТА СООБЩЕСТВА:\n\n${context}`;

  const { content, tokensUsed: chatTokens } = await chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { model: "openai/gpt-4o-mini", temperature: 0.3, maxTokens: 1500 }
  );

  return {
    answer: content,
    sources: sources.slice(0, TOP_K_FOR_LLM),
    tokensUsed: { embed: embedTokens, chat: chatTokens },
  };
}
