import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizedMessage } from "../lib/types";

const INPUT = resolve("data/messages.jsonl");

function main() {
  const lines = readFileSync(INPUT, "utf-8").split("\n").filter(Boolean);
  const messages: NormalizedMessage[] = lines.map((l) => JSON.parse(l));

  const authors = new Set(messages.map((m) => m.authorId));
  const withReactions = messages.filter((m) => m.reactionsTotal > 0);
  const withReply = messages.filter((m) => m.replyTo !== null);
  const totalReactions = messages.reduce((s, m) => s + m.reactionsTotal, 0);
  const lengths = messages.map((m) => m.text.length).sort((a, b) => a - b);
  const avgLen = Math.round(lengths.reduce((s, n) => s + n, 0) / lengths.length);
  const medianLen = lengths[Math.floor(lengths.length / 2)];

  const dates = messages.map((m) => m.ts).sort((a, b) => a - b);
  const first = new Date(dates[0] * 1000).toISOString().slice(0, 10);
  const last = new Date(dates[dates.length - 1] * 1000).toISOString().slice(0, 10);

  console.log("=== messages.jsonl ===");
  console.table({
    messages: messages.length,
    uniqueAuthors: authors.size,
    withReply: withReply.length,
    withReactions: withReactions.length,
    totalReactions,
    avgTextLen: avgLen,
    medianTextLen: medianLen,
    dateFirst: first,
    dateLast: last,
  });

  const topAuthors = [...messages.reduce((m, msg) => {
    m.set(msg.author, (m.get(msg.author) ?? 0) + 1);
    return m;
  }, new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log("\nTop authors:");
  console.table(Object.fromEntries(topAuthors));
}

main();
