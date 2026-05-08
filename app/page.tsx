"use client";

import { useState } from "react";

type Source = {
  id: string;
  text: string;
  start_date: string;
  end_date: string;
  message_count: number;
  participants_count: number;
  reactions_total: number;
};

type AskResponse = {
  answer: string;
  sources: Source[];
  tokensUsed?: { embed: number; chat: number };
  error?: string;
};

const EXAMPLES = [
  "Расход 1.8 на трассе",
  "Когда менять цепь ГРМ",
  "Стук в подвеске на холодную",
  "АКПП 6T40 проблемы",
  "Какое масло лить",
  "Где взять оригинальные колодки",
];

const STATS = [
  { label: "тредов", value: "8 728" },
  { label: "владельцев", value: "783" },
  { label: "мес. обсуждений", value: "21" },
];

export default function Home() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const json = (await res.json()) as AskResponse;
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
      } else {
        setData(json);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (question.trim().length < 5) return;
    ask(question.trim());
  }

  return (
    <main className="mx-auto max-w-5xl px-3 py-5 md:px-4 md:py-10">
      {/* Header pill */}
      <div className="rounded-3xl bg-[linear-gradient(135deg,#1e2a4f_0%,#0f1a35_100%)] px-5 py-4 md:px-7 md:py-5 shadow-neu">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            <div className="grid h-11 w-11 md:h-12 md:w-12 shrink-0 place-items-center rounded-2xl bg-accent text-white text-xl">
              🚗
            </div>
            <div className="min-w-0">
              <h1 className="text-lg md:text-2xl font-semibold text-white leading-tight">
                Orlando<span className="text-blue-300">-AI</span>
              </h1>
              <p className="text-[11px] md:text-sm text-blue-200/80 leading-tight truncate">
                Спроси сообщество Chevrolet Orlando
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-blue-100">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            RAG + AI
          </span>
        </div>
      </div>

      {/* Hero: form + side-card */}
      <div className="mt-5 md:mt-6 grid grid-cols-1 gap-5 md:grid-cols-5 md:gap-6">
        {/* Form (3 cols) */}
        <div className="md:col-span-3 rounded-3xl bg-soft p-5 md:p-7 shadow-neu">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-accent">🔍</span>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Спроси AI
            </h2>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="rounded-2xl shadow-neuInset bg-bg">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Например: расход 1.8 на трассе, когда менять цепь, стук на холодную…"
                rows={3}
                className="w-full resize-none rounded-2xl bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted/70"
              />
            </div>

            <button
              type="submit"
              disabled={loading || question.trim().length < 5}
              className="rounded-2xl bg-accent px-5 py-3.5 text-sm font-semibold text-white shadow-neuSm transition hover:opacity-95 active:shadow-neuInsetSm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  <span>Ищу в чате…</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>Спросить сообщество</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Популярные вопросы
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setQuestion(ex);
                    ask(ex);
                  }}
                  disabled={loading}
                  className="rounded-full bg-bg px-3 py-1.5 text-xs text-muted shadow-neuSm transition hover:text-ink active:shadow-neuInsetSm disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Side card (2 cols) */}
        <div className="md:col-span-2 rounded-3xl bg-soft p-5 md:p-6 shadow-neu flex flex-col">
          <div className="mx-auto mt-2 mb-4 grid h-20 w-20 md:h-24 md:w-24 place-items-center rounded-3xl bg-bg shadow-neuInset text-5xl md:text-6xl">
            🚗
          </div>

          <h3 className="text-center text-base md:text-lg font-semibold leading-snug">
            Опыт реальных<br className="hidden md:inline" /> владельцев Orlando
          </h3>
          <p className="mt-2 text-center text-xs md:text-sm text-muted leading-relaxed">
            AI ищет в архиве ТГ-чата сообщества и отвечает с цитатами реальных людей — с датами и реакциями.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl bg-bg p-3 text-center shadow-neuInsetSm"
              >
                <div className="text-base md:text-lg font-bold text-ink leading-tight">
                  {s.value}
                </div>
                <div className="mt-0.5 text-[10px] md:text-xs text-muted leading-tight">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <FeaturePill icon="🛡️" text="Реальный опыт, не выдумки AI" />
            <FeaturePill icon="⚡" text="Ответ за 5–10 секунд" />
            <FeaturePill icon="📌" text="Цитаты с источниками" />
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="mt-5 md:mt-6 rounded-3xl bg-soft p-5 md:p-7 shadow-neu">
          <div className="flex items-center gap-3 text-muted">
            <div className="flex gap-1.5">
              <div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              <div className="h-2 w-2 animate-pulse rounded-full bg-accent" style={{ animationDelay: "0.2s" }} />
              <div className="h-2 w-2 animate-pulse rounded-full bg-accent" style={{ animationDelay: "0.4s" }} />
            </div>
            <span className="text-sm">Ищу в базе сообщества и собираю ответ…</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-5 md:mt-6 rounded-3xl bg-soft p-5 shadow-neu">
          <p className="text-sm text-red-600">⚠ Ошибка: {error}</p>
        </div>
      )}

      {/* Answer */}
      {data && !loading && (
        <div className="mt-5 md:mt-6 rounded-3xl bg-soft p-5 md:p-7 shadow-neu">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-xl bg-accent text-white text-sm shadow-neuSm">
              💬
            </span>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Ответ
            </h2>
          </div>

          <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
            {data.answer}
          </div>

          {data.sources.length > 0 && (
            <div className="mt-6 border-t border-bg pt-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                📚 Источники из чата ({data.sources.length})
              </h3>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {data.sources.map((s) => (
                  <details
                    key={s.id}
                    className="group rounded-2xl bg-bg p-3.5 shadow-neuInsetSm cursor-pointer transition"
                  >
                    <summary className="flex items-center justify-between gap-2 text-xs md:text-sm list-none [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center gap-2 text-ink/90 font-medium min-w-0">
                        <span className="text-accent">📅</span>
                        <span className="truncate">{s.start_date.slice(0, 10)}</span>
                        <span className="text-muted">•</span>
                        <span className="text-muted shrink-0">{s.message_count} сооб.</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {s.reactions_total > 0 && (
                          <span className="text-xs text-muted">❤ {s.reactions_total}</span>
                        )}
                        <span className="text-muted text-xs group-open:rotate-90 transition-transform">▶</span>
                      </span>
                    </summary>
                    <p className="mt-3 text-xs leading-relaxed text-ink/75 whitespace-pre-wrap">
                      {s.text.length > 600 ? s.text.slice(0, 600) + "…" : s.text}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="mt-8 mb-4 text-center text-[11px] md:text-xs text-muted">
        Orlando-AI · экспериментальный · данные из чата сообщества + AI-эксперт
      </p>
    </main>
  );
}

function FeaturePill({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-bg px-3 py-2.5 shadow-neuSm">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-soft shadow-neuInsetSm text-sm">
        {icon}
      </span>
      <span className="text-xs md:text-sm text-ink/80 leading-snug">{text}</span>
    </div>
  );
}
