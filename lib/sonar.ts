import { httpPost } from "./http";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Sonar умеет искать в сети. Платно, но дёшево: ~0.3-1.5 ₽ за вопрос.
// Если нужно ещё умнее — заменить на "perplexity/sonar-pro" или "perplexity/sonar-reasoning".
const MODEL = "perplexity/sonar";

const SYSTEM = `Ты — AI-помощник владельца Chevrolet Orlando. Отвечаешь на русском, кратко и по делу.

МАШИНА ВЛАДЕЛЬЦА (учитывай в ответе, но не повторяй без необходимости):
- Chevrolet Orlando 2012, VIN KL1YA755JCK767286
- Двигатель: 1.8 бензин F18D4 (Family I, НЕ дизель)
- ГРМ: РЕМЕНЬ (не цепь)
- КПП: АКПП 6T40

ПРАВИЛА:
- Используй веб-поиск для актуальных цен на запчасти, артикулов, свежих регламентов, обсуждений на форумах.
- 2–4 коротких абзаца или 4–6 буллетов. Без воды.
- Если в источниках есть конкретные цифры (пробег, цена, артикул) — приводи их.
- НЕ выдумывай. Если нет данных в найденных источниках — честно скажи.`;

type SonarResponse = {
  choices: { message?: { content?: string } }[];
  citations?: string[];
  usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

export type SonarAnswer = {
  answer: string;
  citations: { url: string }[];
  tokensUsed: number;
};

export async function askSonar(question: string): Promise<SonarAnswer> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const res = await httpPost(
    OPENROUTER_URL,
    {
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: question },
      ],
      temperature: 0.3,
      max_tokens: 1200,
    },
    {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://orlando-ai.vercel.app",
      "X-Title": "orlando-ai",
    },
    60_000,
  );

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Sonar ${res.status}: ${res.body.slice(0, 300)}`);
  }

  const json = JSON.parse(res.body) as SonarResponse;
  if (json.error) throw new Error(`Sonar error: ${json.error.message ?? "unknown"}`);

  const answer = json.choices?.[0]?.message?.content?.trim() ?? "";
  const urls = Array.isArray(json.citations) ? json.citations.filter((u) => typeof u === "string") : [];
  // дедуп + ограничение
  const seen = new Set<string>();
  const citations = urls
    .filter((u) => {
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    })
    .slice(0, 12)
    .map((url) => ({ url }));

  return {
    answer,
    citations,
    tokensUsed: json.usage?.total_tokens ?? 0,
  };
}
