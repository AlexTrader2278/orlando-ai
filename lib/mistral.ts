import { spawn } from "node:child_process";

const MISTRAL_URL = "https://api.mistral.ai/v1/embeddings";
const MODEL = "mistral-embed";
export const EMBED_DIMS = 1024;

// mistral-embed принимает до 8192 токенов на текст. Берём ~6000 chars с запасом.
export const MAX_INPUT_CHARS = 6000;

type MistralResponse = {
  id: string;
  object: string;
  data: { object: string; index: number; embedding: number[] }[];
  model: string;
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

/**
 * Локально fetch Node на Windows стабильно режется TLS-fingerprint детектом
 * Cloudflare. Поэтому используем curl через child_process — он работает.
 * На Vercel этот код не выполняется (там индексация не нужна).
 */
function curlPost(url: string, body: unknown, apiKey: string, timeoutSec = 30): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const args = [
      "-sS",
      "--max-time",
      String(timeoutSec),
      "--http1.1",
      "-w",
      "\n%{http_code}",
      "-X",
      "POST",
      url,
      "-H",
      `Authorization: Bearer ${apiKey}`,
      "-H",
      "Content-Type: application/json; charset=utf-8",
      "--data-binary",
      "@-", // читать тело из stdin — обходит проблемы с кириллицей и Windows-shell
    ];

    const proc = spawn("curl", args, { windowsHide: true });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout.on("data", (c) => chunks.push(c));
    proc.stderr.on("data", (c) => errChunks.push(c));

    proc.on("error", reject);
    proc.on("close", (code) => {
      const stderr = Buffer.concat(errChunks).toString("utf-8");
      if (code !== 0) {
        return reject(new Error(`curl exited ${code}: ${stderr.trim()}`));
      }
      const out = Buffer.concat(chunks).toString("utf-8");
      const lastNewline = out.lastIndexOf("\n");
      const status = Number(out.slice(lastNewline + 1).trim());
      const responseBody = out.slice(0, lastNewline);
      resolve({ status, body: responseBody });
    });

    // отправляем JSON через stdin как UTF-8 байты
    proc.stdin.end(Buffer.from(JSON.stringify(body), "utf-8"));
  });
}

export async function embed(
  texts: string[],
  apiKey: string
): Promise<{ embeddings: number[][]; tokensUsed: number }> {
  if (texts.length === 0) return { embeddings: [], tokensUsed: 0 };

  const inputs = texts.map((t) =>
    t.length > MAX_INPUT_CHARS ? t.slice(0, MAX_INPUT_CHARS) : t
  );

  const res = await curlPost(MISTRAL_URL, { model: MODEL, input: inputs }, apiKey, 60);

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
