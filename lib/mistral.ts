import { httpPost } from "./http";

const MISTRAL_URL = "https://api.mistral.ai/v1/embeddings";
const MODEL = "mistral-embed";
export const EMBED_DIMS = 1024;

// mistral-embed: до 8192 токенов на текст. Берём ~6000 chars с запасом.
export const MAX_INPUT_CHARS = 6000;

type MistralResponse = {
  data: { index: number; embedding: number[] }[];
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

export async function embed(
  texts: string[],
  apiKey: string
): Promise<{ embeddings: number[][]; tokensUsed: number }> {
  if (texts.length === 0) return { embeddings: [], tokensUsed: 0 };

  const inputs = texts.map((t) =>
    t.length > MAX_INPUT_CHARS ? t.slice(0, MAX_INPUT_CHARS) : t
  );

  const res = await httpPost(
    MISTRAL_URL,
    { model: MODEL, input: inputs },
    { Authorization: `Bearer ${apiKey}` },
    60_000
  );

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Mistral ${res.status}: ${res.body.slice(0, 300)}`);
  }

  const json = JSON.parse(res.body) as MistralResponse;
  const sorted = json.data.slice().sort((a, b) => a.index - b.index);
  return {
    embeddings: sorted.map((d) => d.embedding),
    tokensUsed: json.usage?.total_tokens ?? json.usage?.prompt_tokens ?? 0,
  };
}
