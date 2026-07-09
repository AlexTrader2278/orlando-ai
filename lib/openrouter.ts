import { httpPost } from "./http";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

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

export async function chat(
  messages: ChatMessage[],
  opts: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<{ content: string; tokensUsed: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const res = await httpPost(
    OPENROUTER_URL,
    {
      model: opts.model ?? "openai/gpt-4o-mini",
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1200,
    },
    {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://orlando-ai.vercel.app",
      "X-Title": "orlando-ai",
    },
    60_000
  );

  if (res.status >= 400) {
    throw new Error(`OpenRouter ${res.status}: ${res.body.slice(0, 500)}`);
  }

  const json = JSON.parse(res.body) as ChatResponse;
  if (json.error) {
    throw new Error(`OpenRouter error: ${json.error.message ?? JSON.stringify(json.error)}`);
  }
  const content = json.choices?.[0]?.message?.content?.trim() ?? "";
  return { content, tokensUsed: json.usage?.total_tokens ?? 0 };
}
