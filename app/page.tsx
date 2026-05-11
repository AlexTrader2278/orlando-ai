"use client";

import { useEffect, useState } from "react";

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
  error?: string;
};

type CarSummary = {
  totalRecords: number;
  currentMileage: number | null;
  lastDate: string | null;
  lastWorks: string[];
};

type CarResponse = { summary: CarSummary; error?: string };

const EXAMPLES = [
  "Когда пора менять масло?",
  "Цепь ГРМ — пора?",
  "Стук в подвеске на холодную",
  "Что владельцы пишут про АКПП 6T40",
  "Какое масло лить в 1.8",
  "Где взять оригинальные колодки",
];

export default function Home() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [car, setCar] = useState<CarSummary | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logText, setLogText] = useState("");
  const [logSaving, setLogSaving] = useState(false);
  const [logMessage, setLogMessage] = useState<string | null>(null);
  const [pinSet, setPinSet] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPinSet(Boolean(localStorage.getItem("orlando-ai:admin")));
    }
  }, []);

  useEffect(() => {
    fetch("/api/car")
      .then((r) => r.json())
      .then((j: CarResponse) => {
        if (j.summary) setCar(j.summary);
      })
      .catch(() => {});
  }, []);

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
      if (!res.ok) setError(json.error ?? `HTTP ${res.status}`);
      else setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function onAskSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (question.trim().length < 5) return;
    ask(question.trim());
  }

  function askForPin(): string | null {
    const k = prompt("Введи PIN-код для записи (запомнится в этом браузере):");
    if (!k) return null;
    localStorage.setItem("orlando-ai:admin", k);
    setPinSet(true);
    return k;
  }

  function forgetPin() {
    localStorage.removeItem("orlando-ai:admin");
    setPinSet(false);
    setLogMessage("PIN удалён из браузера. Запись закрыта.");
  }

  async function saveLog() {
    if (logText.trim().length < 5) return;
    setLogSaving(true);
    setLogMessage(null);
    try {
      let adminKey =
        typeof window !== "undefined" ? localStorage.getItem("orlando-ai:admin") ?? "" : "";
      if (!adminKey) {
        const fresh = askForPin();
        if (!fresh) {
          setLogSaving(false);
          return;
        }
        adminKey = fresh;
      }
      const res = await fetch("/api/log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": adminKey,
        },
        body: JSON.stringify({ text: logText.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem("orlando-ai:admin");
          setPinSet(false);
          setLogMessage("Неверный PIN. Попробуй снова — нажми «Сохранить».");
        } else {
          setLogMessage(`Ошибка: ${json.error ?? res.status}`);
        }
        return;
      }
      setLogMessage("✓ Записано. AI теперь это учитывает.");
      setLogText("");
      const fresh = await fetch("/api/car").then((r) => r.json());
      if (fresh.summary) setCar(fresh.summary);
    } catch (e) {
      setLogMessage(`Ошибка: ${(e as Error).message}`);
    } finally {
      setLogSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-3 py-5 md:px-4 md:py-10">
      {/* Header */}
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
                Спроси сообщество + AI помнит твою машину
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-blue-100">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            RAG + AI + History
          </span>
        </div>
      </div>

      {/* Hero: form + my-car */}
      <div className="mt-5 md:mt-6 grid grid-cols-1 gap-5 md:grid-cols-5 md:gap-6">
        {/* Form (3 cols) */}
        <div className="md:col-span-3 rounded-3xl bg-soft p-5 md:p-7 shadow-neu">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-accent">🔍</span>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Спроси AI
            </h2>
          </div>

          <form onSubmit={onAskSubmit} className="flex flex-col gap-4">
            <div className="rounded-2xl shadow-neuInset bg-bg">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Например: пора ли менять масло? цепь ГРМ? стук на холодную…"
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
                  <span>Ищу в чате + смотрю историю…</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>Спросить</span>
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

        {/* My car (2 cols) */}
        <div className="md:col-span-2 rounded-3xl bg-soft p-5 md:p-6 shadow-neu flex flex-col">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-accent">🛠️</span>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Моя машина
            </h2>
          </div>

          {!car && (
            <p className="mt-2 text-xs text-muted">Загружаю историю…</p>
          )}

          {car && car.totalRecords === 0 && (
            <p className="mt-2 text-xs text-muted">
              История пуста. Запиши первую работу — AI будет это учитывать в ответах.
            </p>
          )}

          {car && car.totalRecords > 0 && (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-bg p-3 text-center shadow-neuInsetSm">
                  <div className="text-base md:text-lg font-bold text-ink leading-tight">
                    {car.currentMileage ? car.currentMileage.toLocaleString("ru-RU") : "—"}
                  </div>
                  <div className="mt-0.5 text-[10px] md:text-xs text-muted leading-tight">
                    км пробег
                  </div>
                </div>
                <div className="rounded-2xl bg-bg p-3 text-center shadow-neuInsetSm">
                  <div className="text-base md:text-lg font-bold text-ink leading-tight">
                    {car.totalRecords}
                  </div>
                  <div className="mt-0.5 text-[10px] md:text-xs text-muted leading-tight">
                    записей
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-bg p-3 shadow-neuInsetSm">
                <div className="text-[10px] uppercase tracking-wide text-muted">
                  Последняя работа · {car.lastDate}
                </div>
                <ul className="mt-1.5 space-y-0.5 text-xs text-ink/85">
                  {car.lastWorks.map((w, i) => (
                    <li key={i} className="leading-snug">• {w}</li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => setLogOpen((x) => !x)}
            className="mt-4 rounded-2xl bg-bg px-3 py-2.5 text-xs md:text-sm font-medium text-ink shadow-neuSm transition active:shadow-neuInsetSm flex items-center justify-center gap-1.5"
          >
            {logOpen ? (
              <>
                <span>×</span>
                <span>Закрыть</span>
              </>
            ) : (
              <>
                <span>✍️</span>
                <span>Записать работу</span>
                <span className="text-[10px] text-muted">{pinSet ? "🔓" : "🔒"}</span>
              </>
            )}
          </button>

          {logOpen && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="rounded-2xl shadow-neuInset bg-bg">
                <textarea
                  value={logText}
                  onChange={(e) => setLogText(e.target.value)}
                  rows={3}
                  placeholder="напр.: сегодня поменял масло мобил 5w30 4л + фильтр махле, пробег 198500, отдал 3200"
                  className="w-full resize-none rounded-2xl bg-transparent px-3 py-2.5 text-xs md:text-sm outline-none placeholder:text-muted/70"
                />
              </div>
              <button
                type="button"
                onClick={saveLog}
                disabled={logSaving || logText.trim().length < 5}
                className="rounded-2xl bg-accent px-3 py-2.5 text-xs md:text-sm font-semibold text-white shadow-neuSm transition active:shadow-neuInsetSm disabled:opacity-50"
              >
                {logSaving ? "Сохраняю…" : "Сохранить"}
              </button>
              {logMessage && (
                <p className="text-[11px] text-muted leading-snug">{logMessage}</p>
              )}
              {pinSet && (
                <button
                  type="button"
                  onClick={forgetPin}
                  className="self-start text-[10px] text-muted underline-offset-2 hover:underline"
                >
                  забыть PIN на этом устройстве
                </button>
              )}
            </div>
          )}
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
            <span className="text-sm">Собираю ответ…</span>
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

      <p className="mt-8 mb-4 text-center text-[11px] md:text-xs text-muted">
        Orlando-AI · твой персональный помощник по Орландо
      </p>
    </main>
  );
}
