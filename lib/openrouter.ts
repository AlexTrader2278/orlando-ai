import { httpPost } from "./http";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Запасная модель, если основная не ответила вовремя: быстрая и дешёвая, уже используется в проекте для звука. */
export const FALLBACK_MODEL = "google/gemini-2.5-flash";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "input_audio"; input_audio: { data: string; format: string } }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

type Choice = {
  message?: { role: string; content: string };
  finish_reason?: string;
};

type ChatResponse = {
  choices: Choice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string; code?: number | string };
};

type ChatOpts = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Сколько ждать основную модель, мс (по умолчанию 60 000). */
  timeoutMs?: number;
  /** Если основная модель не ответила или ответила ошибкой — один раз спросить эту. */
  fallbackModel?: string;
};

async function chatOnce(
  messages: ChatMessage[],
  model: string,
  opts: ChatOpts,
  timeoutMs: number
): Promise<{ content: string; tokensUsed: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const res = await httpPost(
    OPENROUTER_URL,
    {
      model,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1200,
    },
    {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://orlando-ai.vercel.app",
      "X-Title": "orlando-ai",
    },
    timeoutMs
  );

  if (res.status >= 400) {
    throw new Error(`OpenRouter ${res.status}: ${res.body.slice(0, 500)}`);
  }

  const json = JSON.parse(res.body) as ChatResponse;
  if (json.error) {
    throw new Error(`OpenRouter error: ${json.error.message ?? JSON.stringify(json.error)}`);
  }
  const content = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("OpenRouter: пустой ответ модели");
  return { content, tokensUsed: json.usage?.total_tokens ?? 0 };
}

export async function chat(messages: ChatMessage[], opts: ChatOpts = {}): Promise<{ content: string; tokensUsed: number }> {
  const model = opts.model ?? "openai/gpt-4o-mini";
  try {
    return await chatOnce(messages, model, opts, opts.timeoutMs ?? 60_000);
  } catch (e) {
    if (!opts.fallbackModel || opts.fallbackModel === model) throw e;
    // Ключ не принят — запасная модель через тот же ключ тоже не поможет.
    if ((e as Error).message.startsWith("OpenRouter 401")) throw e;
    console.warn(`chat: ${model} не ответил (${(e as Error).message.slice(0, 160)}), спрашиваю ${opts.fallbackModel}`);
    return await chatOnce(messages, opts.fallbackModel, opts, 60_000);
  }
}
