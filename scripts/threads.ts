import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizedMessage, Thread } from "../lib/types.js";

const INPUT = resolve("data/messages.jsonl");
const OUTPUT = resolve("data/threads.jsonl");

// Если последнее сообщение от того же автора было меньше N секунд назад — склеиваем.
const SAME_AUTHOR_WINDOW_SEC = 5 * 60;

// Минимальный суммарный размер текста треда, чтобы его сохранить.
const MIN_THREAD_TEXT_LEN = 80;

class DSU {
  private parent = new Map<number, number>();

  find(x: number): number {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      return x;
    }
    let root = x;
    while (this.parent.get(root)! !== root) root = this.parent.get(root)!;
    // path compression
    let cur = x;
    while (this.parent.get(cur)! !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    // всегда выбираем меньший id как корень — это будет "первое сообщение треда"
    const root = ra < rb ? ra : rb;
    const other = ra < rb ? rb : ra;
    this.parent.set(other, root);
  }
}

function buildText(messages: NormalizedMessage[]): string {
  return messages
    .map((m) => `[${m.author}]: ${m.text}`)
    .join("\n");
}

function main() {
  const lines = readFileSync(INPUT, "utf-8").split("\n").filter(Boolean);
  const messages: NormalizedMessage[] = lines.map((l) => JSON.parse(l));

  // сортируем по времени для надёжной обработки окна по автору
  messages.sort((a, b) => a.ts - b.ts);

  const dsu = new DSU();
  const idToMsg = new Map<number, NormalizedMessage>();
  for (const m of messages) idToMsg.set(m.id, m);

  // 1) reply-связи
  for (const m of messages) {
    if (m.replyTo !== null && idToMsg.has(m.replyTo)) {
      dsu.union(m.id, m.replyTo);
    }
  }

  // 2) серии сообщений от одного автора в окне 5 минут
  const lastByAuthor = new Map<string, NormalizedMessage>();
  for (const m of messages) {
    const prev = lastByAuthor.get(m.authorId);
    if (prev && m.ts - prev.ts <= SAME_AUTHOR_WINDOW_SEC) {
      dsu.union(m.id, prev.id);
    }
    lastByAuthor.set(m.authorId, m);
  }

  // собираем группы
  const groups = new Map<number, NormalizedMessage[]>();
  for (const m of messages) {
    const root = dsu.find(m.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(m);
  }

  const threads: Thread[] = [];
  let dropped = 0;

  for (const [rootId, msgs] of groups) {
    msgs.sort((a, b) => a.ts - b.ts);

    const text = buildText(msgs);
    if (text.length < MIN_THREAD_TEXT_LEN) {
      dropped++;
      continue;
    }

    const reactionsTotal = msgs.reduce((s, m) => s + m.reactionsTotal, 0);
    const participants = new Set(msgs.map((m) => m.authorId));

    threads.push({
      id: `t${rootId}`,
      rootId,
      startDate: msgs[0].date,
      endDate: msgs[msgs.length - 1].date,
      messageCount: msgs.length,
      participantsCount: participants.size,
      reactionsTotal,
      text,
      messages: msgs,
    });
  }

  // сортируем для удобной просмотра — самые большие сверху
  threads.sort((a, b) => b.messageCount - a.messageCount);

  writeFileSync(
    OUTPUT,
    threads.map((t) => JSON.stringify(t)).join("\n") + "\n",
    "utf-8"
  );

  // статистика
  const sizes = threads.map((t) => t.messageCount).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)];
  const max = sizes[sizes.length - 1];
  const singleMessage = threads.filter((t) => t.messageCount === 1).length;
  const longThreads = threads.filter((t) => t.messageCount >= 5).length;
  const withReactions = threads.filter((t) => t.reactionsTotal > 0).length;
  const totalChars = threads.reduce((s, t) => s + t.text.length, 0);
  const avgChars = Math.round(totalChars / threads.length);

  console.log("=== Threads ===");
  console.table({
    threads: threads.length,
    droppedShort: dropped,
    medianSize: median,
    maxSize: max,
    singleMessage,
    longThreads_5plus: longThreads,
    withReactions,
    avgChars,
    totalChars,
  });

  console.log("\nTop 5 longest threads:");
  for (const t of threads.slice(0, 5)) {
    const preview = t.text.replace(/\s+/g, " ").slice(0, 120);
    console.log(`  ${t.id} (${t.messageCount} msgs, ${t.participantsCount} ppl, ${t.reactionsTotal}❤): ${preview}…`);
  }

  console.log(`\nWrote ${threads.length} threads → ${OUTPUT}`);
}

main();
