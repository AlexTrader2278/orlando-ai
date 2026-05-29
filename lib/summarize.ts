import { embed } from "./mistral";
import { rpcSearchThreads, type SearchResult } from "./supabase-rest";
import { chat } from "./openrouter";

// Те же модели/пакеты что и в /api/ask, отдельной зависимости не плодим.
const SUMMARIZE_MODEL = "deepseek/deepseek-chat";
const TOP_K_FOR_LLM = 10;

/**
 * Сводка ТОЛЬКО по обсуждениям сообщества — без истории моей машины.
 * Аналог "Суммировать находки" из palisade.
 */
const SYSTEM_PROMPT = `Ты — AI-аналитик обсуждений сообщества владельцев Chevrolet Orlando.

ЗАДАЧА: коротко и по делу суммировать, что владельцы пишут по теме вопроса.

ИСТОЧНИК: только предоставленные цитаты из чата. НИКОГДА не выдумывай факты, имена, артикулы и цены.

ФОРМАТ ОТВЕТА (≤6 буллетов или 3 коротких абзаца):
- Сначала 2–4 главных тезиса: что владельцы в основном делают / советуют / на что жалуются.
- Затем 2–3 конкретных факта/цифры/артикула которые часто упоминаются.
- Если мнения расходятся — отметь это явно ("одни говорят X, другие Y").
- Если данных мало — честно скажи "обсуждений по теме мало".

НЕ ДЕЛАЙ:
- Не давай советов про конкретно мою машину (это другой режим).
- Не пиши "тред №3" или "Источник 5" — просто формулируй обычным текстом.
- Не используй markdown-таблицы — только текст и буллеты "-".`;

function buildContext(threads: SearchResult[]): string {
  return threads
    .slice(0, TOP_K_FOR_LLM)
    .map((t, i) => {
      const date = t.start_date.slice(0, 10);
      const truncated = t.text.length > 1500 ? t.text.slice(0, 1500) + "…" : t.text;
      return `--- ОБСУЖДЕНИЕ ${i + 1} (дата: ${date}, сообщений: ${t.message_count}, реакций: ${t.reactions_total}) ---\n${truncated}`;
    })
    .join("\n\n");
}

export type SummarizeAnswer = {
  answer: string;
  sources: SearchResult[];
  tokensUsed: { embed: number; chat: number };
};

export async function summarizeFindings(question: string): Promise<SummarizeAnswer> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not set");

  const { embeddings, tokensUsed: embedTokens } = await embed([question], apiKey);
  const queryEmbedding = `[${embeddings[0].join(",")}]`;
  const sources = await rpcSearchThreads(queryEmbedding, question, 15);

  if (sources.length === 0) {
    return {
      answer: "В базе сообщества по этому вопросу обсуждений не нашлось. Попробуй переформулировать.",
      sources: [],
      tokensUsed: { embed: embedTokens, chat: 0 },
    };
  }

  const context = buildContext(sources);
  const userPrompt = `ЦИТАТЫ ИЗ ЧАТА СООБЩЕСТВА:\n\n${context}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nВОПРОС — суммируй ТОЛЬКО по теме вопроса:\n\n«${question}»`;

  const { content, tokensUsed: chatTokens } = await chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { model: SUMMARIZE_MODEL, temperature: 0.3, maxTokens: 900 }
  );

  return {
    answer: content,
    sources: sources.slice(0, TOP_K_FOR_LLM),
    tokensUsed: { embed: embedTokens, chat: chatTokens },
  };
}
