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
  "Расход топлива 1.8 на трассе",
  "Стоит ли менять цепь ГРМ на 120к",
  "Стук в подвеске спереди на холодную",
  "АКПП 6T40 проблемы и обслуживание",
  "Какое масло лить в двигатель",
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
    <main className="mx-auto max-w-4xl px-4 py-8 md:py-12">
      {/* Header */}
      <div className="rounded-3xl bg-[linear-gradient(135deg,#1e2a4f_0%,#0f1a35_100%)] px-6 py-5 md:px-8 md:py-6 shadow-neu">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-white text-2xl">
              🚗
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-white">Orlando-AI</h1>
              <p className="text-xs md:text-sm text-blue-200/80">
                Спроси сообщество Chevrolet Orlando
              </p>
            </div>
          </div>
          <span className="hidden md:inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> RAG + AI
          </span>
        </div>
      </div>

      {/* Input card */}
      <div className="mt-6 rounded-3xl bg-soft p-5 md:p-7 shadow-neu">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="text-sm font-medium text-muted">Твой вопрос</label>
          <div className="rounded-2xl shadow-neuInset bg-bg">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Например: расход 1.8 на трассе, стук в подвеске, замена цепи на 120к..."
              rows={3}
              className="w-full resize-none rounded-2xl bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted/70"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={loading || question.trim().length < 5}
              className="rounded-2xl bg-accent px-6 py-3 text-sm font-medium text-white shadow-neuSm transition hover:opacity-95 active:shadow-neuInsetSm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Ищу в чате…" : "Спросить"}
            </button>
            <span className="text-xs text-muted">
              ~5 секунд • 8728 тредов • 783 владельца
            </span>
          </div>

          {/* Examples */}
          <div className="flex flex-wrap gap-2 pt-2">
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
        </form>
      </div>

      {/* Loading */}
      {loading && (
        <div className="mt-6 rounded-3xl bg-soft p-6 shadow-neu">
          <div className="flex items-center gap-3 text-muted">
            <div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            <div className="h-2 w-2 animate-pulse rounded-full bg-accent" style={{ animationDelay: "0.15s" }} />
            <div className="h-2 w-2 animate-pulse rounded-full bg-accent" style={{ animationDelay: "0.3s" }} />
            <span className="text-sm">Ищу в базе сообщества и собираю ответ…</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-6 rounded-3xl bg-soft p-5 shadow-neu">
          <p className="text-sm text-red-600">Ошибка: {error}</p>
        </div>
      )}

      {/* Answer */}
      {data && (
        <div className="mt-6 rounded-3xl bg-soft p-6 md:p-7 shadow-neu">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Ответ
          </h2>
          <div className="prose prose-sm md:prose-base max-w-none whitespace-pre-wrap text-ink leading-relaxed">
            {data.answer}
          </div>

          {data.sources.length > 0 && (
            <div className="mt-6 border-t border-bg pt-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Источники ({data.sources.length} тредов)
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {data.sources.map((s) => (
                  <details
                    key={s.id}
                    className="rounded-2xl bg-bg p-4 shadow-neuInsetSm cursor-pointer"
                  >
                    <summary className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">
                        {s.start_date.slice(0, 10)} • {s.message_count} сообщ. • {s.participants_count} чел.
                      </span>
                      {s.reactions_total > 0 && (
                        <span className="text-xs text-muted">❤ {s.reactions_total}</span>
                      )}
                    </summary>
                    <p className="mt-3 text-xs leading-relaxed text-ink/80 whitespace-pre-wrap">
                      {s.text.length > 800 ? s.text.slice(0, 800) + "…" : s.text}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="mt-8 text-center text-xs text-muted">
        Orlando-AI · экспериментальный · <span className="opacity-70">данные из чата сообщества</span>
      </p>
    </main>
  );
}
