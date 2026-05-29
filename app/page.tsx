"use client";

import { useEffect, useRef, useState } from "react";

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

type ServicePart = {
  name: string;
  brand?: string | null;
  article?: string | null;
  qty?: number | null;
  unit?: string | null;
  price?: number | null;
};

type ServiceRecord = {
  id: string;
  date: string;
  mileage_km: number | null;
  works: string[];
  materials: string[];
  parts: ServicePart[];
  cost_works: number | null;
  cost_materials: number | null;
  cost_total: number | null;
  notes: string | null;
  source: string | null;
};

type CarSummary = {
  totalRecords: number;
  currentMileage: number | null;
  lastDate: string | null;
  lastWorks: string[];
};

type CarResponse = { summary: CarSummary; records: ServiceRecord[]; error?: string };

type ParsedPreview = {
  date: string;
  mileage_km: number | null;
  works: string[];
  materials: string[];
  parts: ServicePart[];
  cost_works: number | null;
  cost_materials: number | null;
  cost_total: number | null;
  notes: string | null;
};

const EXAMPLES = [
  "Когда пора менять масло?",
  "Цепь ГРМ — пора?",
  "Стук в подвеске на холодную",
  "Что владельцы пишут про АКПП 6T40",
  "Какое масло лить в 1.8",
  "Где взять оригинальные колодки",
];

function getAdminKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("orlando-ai:admin") ?? "";
}
function setAdminKey(k: string) {
  localStorage.setItem("orlando-ai:admin", k);
}
function clearAdminKey() {
  localStorage.removeItem("orlando-ai:admin");
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [car, setCar] = useState<CarSummary | null>(null);
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [pinSet, setPinSet] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRecord | null>(null);

  const [logOpen, setLogOpen] = useState(false);
  const [logText, setLogText] = useState("");
  const [logSaving, setLogSaving] = useState(false);
  const [logMessage, setLogMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (preview && previewRef.current) {
      previewRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [preview]);

  async function refreshCar() {
    try {
      const r = await fetch("/api/car").then((x) => x.json());
      if (r.summary) setCar(r.summary);
      if (Array.isArray(r.records)) setRecords(r.records);
    } catch {}
  }

  useEffect(() => {
    setPinSet(Boolean(getAdminKey()));
    refreshCar();
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

  // Сводка ТОЛЬКО по чату сообщества (без истории моей машины).
  async function summarizeFindings(q: string) {
    if (q.trim().length < 2) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q.trim() }),
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
    const k = prompt("Введи PIN-код (запомнится в этом браузере):");
    if (!k) return null;
    setAdminKey(k);
    setPinSet(true);
    return k;
  }
  function forgetPin() {
    clearAdminKey();
    setPinSet(false);
    setLogMessage("PIN удалён из браузера.");
  }

  function resolveAdminKey(): string | null {
    const existing = getAdminKey();
    if (existing) return existing;
    return askForPin();
  }

  // Шаг 1: распознать текст и показать превью — в БД пока ничего не пишется.
  async function previewLog() {
    if (logText.trim().length < 5) return;
    setLogSaving(true);
    setLogMessage(null);
    setPreview(null);
    try {
      const adminKey = resolveAdminKey();
      if (!adminKey) return;
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify({ text: logText.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          clearAdminKey();
          setPinSet(false);
          setLogMessage("Неверный PIN. Нажми «Проверить» снова.");
        } else if (res.status === 422) {
          setLogMessage(`Не распозналось: ${json.error}. Поправь текст и попробуй снова.`);
        } else {
          setLogMessage(`Ошибка: ${json.error ?? res.status}`);
        }
        return;
      }
      setPreview(json.preview as ParsedPreview);
    } catch (e) {
      setLogMessage(`Ошибка: ${(e as Error).message}`);
    } finally {
      setLogSaving(false);
    }
  }

  // Шаг 2: пользователь подтвердил превью — только теперь пишем в БД.
  async function confirmLog() {
    if (!preview) return;
    setLogSaving(true);
    setLogMessage(null);
    try {
      const adminKey = resolveAdminKey();
      if (!adminKey) return;
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify({ confirm: true, record: preview }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          clearAdminKey();
          setPinSet(false);
          setLogMessage("Неверный PIN. Нажми «Сохранить» снова.");
        } else {
          setLogMessage(`Ошибка: ${json.error ?? res.status}`);
        }
        return;
      }
      setLogMessage("✓ Записано. AI теперь это учитывает.");
      setLogText("");
      setPreview(null);
      await refreshCar();
    } catch (e) {
      setLogMessage(`Ошибка: ${(e as Error).message}`);
    } finally {
      setLogSaving(false);
    }
  }

  function cancelPreview() {
    setPreview(null);
    setLogMessage(null);
  }

  async function deleteRecord(rec: ServiceRecord) {
    const works = rec.works.slice(0, 2).join("; ") || "(пусто)";
    if (!confirm(`Удалить запись?\n\n${rec.date} | ${rec.mileage_km ?? "—"} км\n${works}`)) return;

    let adminKey = getAdminKey();
    if (!adminKey) {
      const fresh = askForPin();
      if (!fresh) return;
      adminKey = fresh;
    }
    const res = await fetch(`/api/log/${rec.id}`, {
      method: "DELETE",
      headers: { "X-Admin-Key": adminKey },
    });
    if (!res.ok) {
      if (res.status === 401) {
        clearAdminKey();
        setPinSet(false);
        alert("Неверный PIN — попробуй ещё раз.");
      } else {
        const j = await res.json().catch(() => ({}));
        alert(`Ошибка: ${j.error ?? res.status}`);
      }
      return;
    }
    await refreshCar();
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

      {/* Hero */}
      <div className="mt-5 md:mt-6 grid grid-cols-1 gap-5 md:grid-cols-5 md:gap-6">
        <div className="md:col-span-3 rounded-3xl bg-soft p-5 md:p-7 shadow-neu">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-accent">🔍</span>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Спроси AI</h2>
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

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                disabled={loading || question.trim().length < 5}
                className="flex-1 rounded-2xl bg-accent px-5 py-3.5 text-sm font-semibold text-white shadow-neuSm transition hover:opacity-95 active:shadow-neuInsetSm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                    <span>Думаю…</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Спросить</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => summarizeFindings(question)}
                disabled={loading || question.trim().length < 5}
                title="AI-сводка только по обсуждениям сообщества (без моей истории)"
                className="flex-1 rounded-2xl bg-bg px-5 py-3.5 text-sm font-semibold text-ink shadow-neuSm transition hover:opacity-95 active:shadow-neuInsetSm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>📝</span>
                <span>Суммировать находки</span>
              </button>
            </div>
          </form>

          <div className="mt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Популярные вопросы</p>
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

        {/* Side: Моя машина */}
        <div className="md:col-span-2 rounded-3xl bg-soft p-5 md:p-6 shadow-neu flex flex-col">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-accent">🛠️</span>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Моя машина</h2>
          </div>

          {!car && <p className="mt-2 text-xs text-muted">Загружаю историю…</p>}

          {car && car.totalRecords === 0 && (
            <p className="mt-2 text-xs text-muted">История пуста. Запиши первую работу.</p>
          )}

          {car && car.totalRecords > 0 && (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-bg p-3 text-center shadow-neuInsetSm">
                  <div className="text-base md:text-lg font-bold text-ink leading-tight">
                    {car.currentMileage ? car.currentMileage.toLocaleString("ru-RU") : "—"}
                  </div>
                  <div className="mt-0.5 text-[10px] md:text-xs text-muted leading-tight">км пробег</div>
                </div>
                <div className="rounded-2xl bg-bg p-3 text-center shadow-neuInsetSm">
                  <div className="text-base md:text-lg font-bold text-ink leading-tight">{car.totalRecords}</div>
                  <div className="mt-0.5 text-[10px] md:text-xs text-muted leading-tight">записей</div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-bg p-3 shadow-neuInsetSm">
                <div className="text-[10px] uppercase tracking-wide text-muted">
                  Последняя работа · {car.lastDate}
                </div>
                <ul className="mt-1.5 space-y-0.5 text-xs text-ink/85">
                  {car.lastWorks.map((w, i) => (
                    <li key={i} className="leading-snug">
                      • {w}
                    </li>
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
              {!preview && (
                <button
                  type="button"
                  onClick={previewLog}
                  disabled={logSaving || logText.trim().length < 5}
                  className="rounded-2xl bg-accent px-3 py-2.5 text-xs md:text-sm font-semibold text-white shadow-neuSm transition active:shadow-neuInsetSm disabled:opacity-50"
                >
                  {logSaving ? "Распознаю…" : "Проверить"}
                </button>
              )}

              {preview && (
                <div ref={previewRef} className="rounded-2xl bg-bg p-3 shadow-neuInsetSm flex flex-col gap-1.5 scroll-mt-24">
                  <div className="rounded-xl bg-amber-100 px-3 py-2 text-[11px] font-semibold text-amber-800">
                    ⚠️ ЕЩЁ НЕ СОХРАНЕНО. Проверь и нажми «✓ Сохранить в базу» ниже.
                  </div>
                  <p className="text-[10px] uppercase tracking-wide text-muted">
                    Что AI понял:
                  </p>
                  <div className="text-xs text-ink/90">
                    📅 {preview.date} ·{" "}
                    {preview.mileage_km != null
                      ? `🛣 ${preview.mileage_km.toLocaleString("ru-RU")} км`
                      : "пробег не указан"}
                  </div>
                  {preview.mileage_km == null && (
                    <div className="rounded-xl bg-blue-50 px-3 py-1.5 text-[10px] text-blue-700">
                      💡 Пробег не указан → счётчик «км пробег» не изменится. Если нужно — нажми «Отмена», допиши пробег в текст и проверь снова.
                    </div>
                  )}
                  {preview.works.length > 0 && (
                    <ul className="space-y-0.5 text-xs text-ink/85">
                      {preview.works.map((w, i) => (
                        <li key={i}>• {w}</li>
                      ))}
                    </ul>
                  )}
                  {preview.parts.length > 0 && (
                    <div className="text-[11px] text-muted">
                      🛠{" "}
                      {preview.parts
                        .map((p) =>
                          `${p.brand ?? ""} ${p.name}${p.article ? ` (${p.article})` : ""}`.trim()
                        )
                        .join(", ")}
                    </div>
                  )}
                  {preview.cost_total != null && (
                    <div className="text-[11px] text-muted">
                      💰 {preview.cost_total.toLocaleString("ru-RU")} ₽
                    </div>
                  )}
                  {preview.notes && (
                    <div className="text-[11px] text-muted italic">{preview.notes}</div>
                  )}
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={cancelPreview}
                      disabled={logSaving}
                      className="flex-1 rounded-2xl bg-soft px-3 py-2 text-xs font-medium text-ink shadow-neuSm active:shadow-neuInsetSm disabled:opacity-50"
                    >
                      ✗ Отмена
                    </button>
                    <button
                      type="button"
                      onClick={confirmLog}
                      disabled={logSaving}
                      className="flex-[2] rounded-2xl bg-accent px-3 py-3 text-sm font-bold text-white shadow-neuSm active:shadow-neuInsetSm disabled:opacity-50"
                    >
                      {logSaving ? "Сохраняю…" : "✓ Сохранить в базу"}
                    </button>
                  </div>
                </div>
              )}
              {logMessage && <p className="text-[11px] text-muted leading-snug">{logMessage}</p>}
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

          {/* Все записи */}
          {records.length > 0 && (
            <button
              type="button"
              onClick={() => setRecordsOpen((x) => !x)}
              className="mt-3 rounded-2xl bg-bg px-3 py-2.5 text-xs md:text-sm font-medium text-ink shadow-neuSm transition active:shadow-neuInsetSm flex items-center justify-center gap-1.5"
            >
              <span>📋</span>
              <span>{recordsOpen ? "Скрыть записи" : `Все записи (${records.length})`}</span>
            </button>
          )}

          {/* Скачать базу */}
          {records.length > 0 && (
            <div className="mt-2 flex gap-2">
              <a
                href="/api/export?format=csv"
                className="flex-1 rounded-2xl bg-bg px-3 py-2 text-center text-[11px] md:text-xs font-medium text-ink shadow-neuSm transition active:shadow-neuInsetSm"
              >
                ⬇️ Excel (CSV)
              </a>
              <a
                href="/api/export?format=json"
                className="flex-1 rounded-2xl bg-bg px-3 py-2 text-center text-[11px] md:text-xs font-medium text-ink shadow-neuSm transition active:shadow-neuInsetSm"
              >
                ⬇️ Бэкап (JSON)
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Records list */}
      {recordsOpen && records.length > 0 && (
        <div className="mt-5 md:mt-6 rounded-3xl bg-soft p-5 md:p-7 shadow-neu">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-accent">📋</span>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Все записи</h2>
          </div>
          <div className="space-y-2.5">
            {records.map((r) => (
              <div key={r.id} className="rounded-2xl bg-bg p-3.5 shadow-neuInsetSm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted">
                      {r.date} · {r.mileage_km ? `${r.mileage_km.toLocaleString("ru-RU")} км` : "—"}
                      {r.source === "summary" && <span className="ml-1 text-[10px] opacity-70">(сводка)</span>}
                      {r.source === "seed" && <span className="ml-1 text-[10px] opacity-70">(из истории)</span>}
                    </div>
                    <ul className="mt-1 space-y-0.5 text-sm text-ink/90">
                      {r.works.slice(0, 5).map((w, i) => (
                        <li key={i}>• {w}</li>
                      ))}
                      {r.works.length > 5 && (
                        <li className="text-xs text-muted">…и ещё {r.works.length - 5}</li>
                      )}
                    </ul>
                    {r.parts && r.parts.length > 0 && (
                      <div className="mt-1.5 text-[11px] text-muted">
                        🛠 {r.parts.map((p) => `${p.brand ?? ""} ${p.name}${p.article ? ` (${p.article})` : ""}`.trim()).join(", ")}
                      </div>
                    )}
                    {r.cost_total != null && (
                      <div className="mt-1 text-[11px] text-muted">💰 {r.cost_total.toLocaleString("ru-RU")} ₽</div>
                    )}
                    {r.notes && <div className="mt-1 text-[11px] text-muted italic">{r.notes}</div>}
                  </div>
                  {/* Кнопки edit/delete видны только владельцу с PIN.
                      Гостям бэкенд вернёт 401, но прятать UI чище. */}
                  {pinSet && (
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        title="Редактировать"
                        className="rounded-xl bg-soft px-2.5 py-1.5 text-xs shadow-neuSm active:shadow-neuInsetSm"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRecord(r)}
                        title="Удалить"
                        className="rounded-xl bg-soft px-2.5 py-1.5 text-xs shadow-neuSm active:shadow-neuInsetSm"
                      >
                        🗑
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Ответ</h2>
          </div>

          <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{data.answer}</div>

          {data.sources.length > 0 && (
            <div className="mt-6 border-t border-bg pt-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                📚 Источники из чата ({data.sources.length})
              </h3>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {data.sources.map((s) => (
                  <details key={s.id} className="group rounded-2xl bg-bg p-3.5 shadow-neuInsetSm cursor-pointer transition">
                    <summary className="flex items-center justify-between gap-2 text-xs md:text-sm list-none [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center gap-2 text-ink/90 font-medium min-w-0">
                        <span className="text-accent">📅</span>
                        <span className="truncate">{s.start_date.slice(0, 10)}</span>
                        <span className="text-muted">•</span>
                        <span className="text-muted shrink-0">{s.message_count} сооб.</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {s.reactions_total > 0 && <span className="text-xs text-muted">❤ {s.reactions_total}</span>}
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

      {/* Edit modal */}
      {editing && (
        <EditModal
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refreshCar();
          }}
        />
      )}
    </main>
  );
}

function EditModal({
  record,
  onClose,
  onSaved,
}: {
  record: ServiceRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(record.date);
  const [mileage, setMileage] = useState(record.mileage_km != null ? String(record.mileage_km) : "");
  const [works, setWorks] = useState(record.works.join("\n"));
  const [materials, setMaterials] = useState(record.materials.join("\n"));
  const [costTotal, setCostTotal] = useState(record.cost_total != null ? String(record.cost_total) : "");
  const [notes, setNotes] = useState(record.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    let adminKey = getAdminKey();
    if (!adminKey) {
      const k = prompt("Введи PIN-код:");
      if (!k) {
        setSaving(false);
        return;
      }
      setAdminKey(k);
      adminKey = k;
    }
    try {
      const patch: Record<string, unknown> = {
        date,
        mileage_km: mileage.trim() === "" ? null : Number(mileage),
        works: works.split("\n").map((s) => s.trim()).filter(Boolean),
        materials: materials.split("\n").map((s) => s.trim()).filter(Boolean),
        cost_total: costTotal.trim() === "" ? null : Number(costTotal),
        notes: notes.trim() === "" ? null : notes.trim(),
      };
      const res = await fetch(`/api/log/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        if (res.status === 401) {
          clearAdminKey();
          setErr("Неверный PIN.");
        } else {
          const j = await res.json().catch(() => ({}));
          setErr(j.error ?? `HTTP ${res.status}`);
        }
        return;
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3">
      <div className="w-full max-w-md rounded-3xl bg-soft p-5 md:p-6 shadow-neu max-h-[90vh] overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">✏️ Редактировать</h3>
          <button onClick={onClose} className="text-muted text-xl leading-none">
            ×
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Дата (YYYY-MM-DD)">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-2xl bg-bg px-3 py-2 text-sm shadow-neuInsetSm outline-none"
            />
          </Field>
          <Field label="Пробег (км)">
            <input
              type="number"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              className="w-full rounded-2xl bg-bg px-3 py-2 text-sm shadow-neuInsetSm outline-none"
              placeholder="200000"
            />
          </Field>
          <Field label="Работы (по одной на строку)">
            <textarea
              value={works}
              onChange={(e) => setWorks(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-2xl bg-bg px-3 py-2 text-sm shadow-neuInsetSm outline-none"
            />
          </Field>
          <Field label="Материалы (по одному на строку)">
            <textarea
              value={materials}
              onChange={(e) => setMaterials(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-2xl bg-bg px-3 py-2 text-sm shadow-neuInsetSm outline-none"
            />
          </Field>
          <Field label="Стоимость, ₽ (всего)">
            <input
              type="number"
              value={costTotal}
              onChange={(e) => setCostTotal(e.target.value)}
              className="w-full rounded-2xl bg-bg px-3 py-2 text-sm shadow-neuInsetSm outline-none"
              placeholder="3200"
            />
          </Field>
          <Field label="Заметка">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-2xl bg-bg px-3 py-2 text-sm shadow-neuInsetSm outline-none"
            />
          </Field>
        </div>

        {err && <p className="mt-3 text-xs text-red-600">⚠ {err}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl bg-bg px-3 py-2.5 text-sm font-medium text-ink shadow-neuSm active:shadow-neuInsetSm"
          >
            Отмена
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-2xl bg-accent px-3 py-2.5 text-sm font-semibold text-white shadow-neuSm active:shadow-neuInsetSm disabled:opacity-50"
          >
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
