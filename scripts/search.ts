import { embed } from "../lib/mistral";
import { rpcSearchThreads } from "../lib/supabase-rest";

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Usage: npm run search -- "твой вопрос"');
    process.exit(1);
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not set");

  console.log(`Query: "${query}"\n`);
  console.log("Embedding via Mistral…");
  const t0 = Date.now();
  const { embeddings, tokensUsed } = await embed([query], apiKey);
  console.log(`  done in ${Date.now() - t0}ms (${tokensUsed} tokens)\n`);

  console.log("Searching Supabase (hybrid RRF)…");
  const t1 = Date.now();
  const data = await rpcSearchThreads(
    `[${embeddings[0].join(",")}]`,
    query,
    10
  );
  console.log(`  done in ${Date.now() - t1}ms\n`);

  if (!data || data.length === 0) {
    console.log("Ничего не найдено.");
    return;
  }

  console.log("=== Top 10 ===\n");
  for (let i = 0; i < data.length; i++) {
    const r = data[i] as {
      id: string;
      text: string;
      start_date: string;
      message_count: number;
      participants_count: number;
      reactions_total: number;
      rrf_score: number;
    };
    const date = r.start_date.slice(0, 10);
    const preview = r.text.replace(/\s+/g, " ").slice(0, 220);
    console.log(`#${i + 1}  ${r.id}  ${date}  msgs:${r.message_count} ppl:${r.participants_count} ❤${r.reactions_total}  rrf:${r.rrf_score.toFixed(4)}`);
    console.log(`    ${preview}…\n`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
