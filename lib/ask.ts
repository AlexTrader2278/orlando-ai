import { embed } from "./mistral";
import { rpcSearchThreads, type SearchResult } from "./supabase-rest";
import { chat } from "./openrouter";

const TOP_K_FOR_LLM = 8;

const SYSTEM_PROMPT = `Ты — AI-ассистент для владельцев Chevrolet Orlando. Отвечаешь на русском.

У тебя есть два источника:
1. Твои общие знания об автомобиле Chevrolet Orlando (двигатели 1.8 LUW, 2.0 дизель, АКПП 6T40, цепь ГРМ, типичные болезни).
2. Цитаты из чата сообщества владельцев Орландо — реальный опыт людей с пробегами, артикулами, ценами и регионами.

ПРАВИЛА:
- Сначала дай экспертный ответ кратко и по делу (2–4 абзаца).
- Затем добавь блок "💬 Что пишут владельцы:" — выдержки из 3–5 цитат с источниками.
- В цитатах ИСПОЛЬЗУЙ ТОЛЬКО предоставленные тебе треды. Не выдумывай.
- Каждую цитату оформляй так: «короткая выдержка...» — [Имя автора, дата, реакции]
- Не повторяй цитату дословно — выбирай самое полезное (артикулы, цифры, конкретные действия).
- Если в тредах нет ответа на вопрос — честно скажи.
- Не упоминай "тред #5" или "источник 3" — пиши просто как обычный текст.`;

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
  const userPrompt = `ВОПРОС ВЛАДЕЛЬЦА:\n${question}\n\nЦИТАТЫ ИЗ ЧАТА СООБЩЕСТВА:\n\n${context}`;

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
