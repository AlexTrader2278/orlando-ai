import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { embed, EMBED_DIMS } from "../lib/mistral.js";
import { upsertThreads } from "../lib/supabase-rest.js";
import type { Thread } from "../lib/types.js";

const INPUT = resolve("data/threads.jsonl");

// Mistral принимает до ~16k токенов на один request.
// Кириллица ≈ 3 символа на токен. Держим запас 30%.
const TOKEN_LIMIT_PER_BATCH = 12000;
const CHARS_PER_TOKEN = 3;

// Hard-cap на количество тредов в одном батче (на всякий).
const MAX_BATCH_SIZE = 64;

// Supabase upsert батчами — чтобы не упереться в лимит размера запроса.
const DB_BATCH = 100;

// Mistral free tier ~1 req/sec. Держим запас.
const SLEEP_MS_BETWEEN_BATCHES = 1100;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadThreads(): Thread[] {
  const lines = readFileSync(INPUT, "utf-8").split("\n").filter(Boolean);
  return lines.map((l) => JSON.parse(l));
}

function fmtVector(v: number[]): string {
  // pgvector принимает строку формата "[0.1,0.2,...]"
  return `[${v.join(",")}]`;
}

async function main() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not set in env");

  const threads = loadThreads();

  console.log(`Loaded ${threads.length} threads from ${INPUT}`);
  console.log(`Embedding model: mistral-embed @ ${EMBED_DIMS} dims`);
  console.log(`Token limit per batch: ${TOKEN_LIMIT_PER_BATCH}, DB batch: ${DB_BATCH}\n`);

  let processed = 0;
  let totalTokens = 0;
  const startedAt = Date.now();

  // буфер на upsert: накапливаем embed-результаты и сливаем в БД пачкой
  let dbBuffer: {
    id: string;
    root_id: number;
    start_date: string;
    end_date: string;
    message_count: number;
    participants_count: number;
    reactions_total: number;
    text: string;
    embedding: string;
  }[] = [];

  async function flushDb() {
    if (dbBuffer.length === 0) return;
    try {
      await upsertThreads(dbBuffer);
    } catch (e) {
      console.error("\nSupabase upsert error:", (e as Error).message);
      throw e;
    }
    dbBuffer = [];
  }

  // адаптивная пакетка: набираем треды пока не упрёмся в лимит токенов
  let i = 0;
  while (i < threads.length) {
    const batch: Thread[] = [];
    let estTokens = 0;

    while (i < threads.length && batch.length < MAX_BATCH_SIZE) {
      const t = threads[i];
      const tTokens = Math.ceil(t.text.length / CHARS_PER_TOKEN);
      if (batch.length > 0 && estTokens + tTokens > TOKEN_LIMIT_PER_BATCH) break;
      batch.push(t);
      estTokens += tTokens;
      i++;
    }

    let embeddings: number[][];
    let tokensUsed = 0;
    try {
      const res = await embed(batch.map((t) => t.text), apiKey);
      embeddings = res.embeddings;
      tokensUsed = res.tokensUsed;
      totalTokens += tokensUsed;
    } catch (e) {
      console.error(`\nEmbed batch (size ${batch.length}, est ${estTokens} tok) failed:`, (e as Error).message);
      console.log("Sleeping 5s and retrying once…");
      await sleep(5000);
      const res = await embed(batch.map((t) => t.text), apiKey);
      embeddings = res.embeddings;
      tokensUsed = res.tokensUsed;
      totalTokens += tokensUsed;
    }

    for (let j = 0; j < batch.length; j++) {
      const t = batch[j];
      dbBuffer.push({
        id: t.id,
        root_id: t.rootId,
        start_date: t.startDate,
        end_date: t.endDate,
        message_count: t.messageCount,
        participants_count: t.participantsCount,
        reactions_total: t.reactionsTotal,
        text: t.text,
        embedding: fmtVector(embeddings[j]),
      });
    }

    if (dbBuffer.length >= DB_BATCH) {
      await flushDb();
    }

    processed += batch.length;
    const pct = ((processed / threads.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const tps = (totalTokens / Math.max(1, Number(elapsed))).toFixed(0);
    process.stdout.write(
      `\r  ${processed}/${threads.length} (${pct}%) — ${totalTokens} tokens — ${elapsed}s — ${tps} tok/s `
    );

    await sleep(SLEEP_MS_BETWEEN_BATCHES);
  }

  // финальный flush
  await flushDb();

  console.log("\n\n=== Done ===");
  console.log(`Indexed ${processed} threads`);
  console.log(`Total tokens consumed: ${totalTokens.toLocaleString()}`);
  console.log(`Elapsed: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error("\n\nFatal:", e);
  process.exit(1);
});
