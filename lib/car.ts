import { httpGet, httpPost, httpPatch, httpDelete } from "./http";
import type { ServicePart } from "./types";

export type ServiceRecord = {
  id: string;
  date: string; // YYYY-MM-DD
  mileage_km: number | null;
  works: string[];
  materials: string[];
  parts: ServicePart[];
  cost_works: number | null;
  cost_materials: number | null;
  cost_total: number | null;
  notes: string | null;
  source: string | null;
  created_at: string;
};

function sbUrl(path: string): string {
  const base = process.env.SUPABASE_URL;
  if (!base) throw new Error("SUPABASE_URL is not set");
  return `${base}${path}`;
}

function sbAuth(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return { apikey: key, Authorization: `Bearer ${key}` };
}

export async function getServiceRecords(limit = 50): Promise<ServiceRecord[]> {
  const res = await httpGet(
    sbUrl(`/rest/v1/service_records?select=*&order=date.desc&limit=${limit}`),
    sbAuth(),
    15_000
  );
  if (res.status >= 400) {
    throw new Error(`Supabase get service_records ${res.status}: ${res.body.slice(0, 300)}`);
  }
  return JSON.parse(res.body);
}

export async function insertServiceRecord(rec: Partial<ServiceRecord>): Promise<ServiceRecord> {
  const res = await httpPost(
    sbUrl(`/rest/v1/service_records`),
    rec,
    { ...sbAuth(), Prefer: "return=representation" },
    15_000
  );
  if (res.status >= 400) {
    throw new Error(`Supabase insert service_records ${res.status}: ${res.body.slice(0, 300)}`);
  }
  const arr = JSON.parse(res.body) as ServiceRecord[];
  return arr[0];
}

export async function updateServiceRecord(
  id: string,
  patch: Partial<ServiceRecord>
): Promise<ServiceRecord> {
  const res = await httpPatch(
    sbUrl(`/rest/v1/service_records?id=eq.${encodeURIComponent(id)}`),
    patch,
    { ...sbAuth(), Prefer: "return=representation" },
    15_000
  );
  if (res.status >= 400) {
    throw new Error(`Supabase update service_records ${res.status}: ${res.body.slice(0, 300)}`);
  }
  const arr = JSON.parse(res.body) as ServiceRecord[];
  if (arr.length === 0) throw new Error("Record not found");
  return arr[0];
}

export async function deleteServiceRecord(id: string): Promise<void> {
  const res = await httpDelete(
    sbUrl(`/rest/v1/service_records?id=eq.${encodeURIComponent(id)}`),
    sbAuth(),
    15_000
  );
  if (res.status >= 400) {
    throw new Error(`Supabase delete service_records ${res.status}: ${res.body.slice(0, 300)}`);
  }
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

function fmtPart(p: ServicePart): string {
  const parts = [
    p.brand,
    p.name,
    p.article ? `арт.${p.article}` : null,
    p.qty != null ? `${p.qty}${p.unit ? p.unit : "шт"}` : null,
    p.price != null ? `${p.price.toLocaleString("ru-RU")} ₽` : null,
  ].filter(Boolean);
  return parts.join(" ");
}

function monthsBetween(fromIso: string, toIso: string): number {
  const f = new Date(fromIso);
  const t = new Date(toIso);
  const months = (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth());
  return Math.max(0, months);
}

/** Извлекает явно названный текущий пробег из вопроса пользователя.
 *  Распознаёт: "сейчас 200500", "пробег 200к", "сегодня 200 500 км", "200 500" и т.п. */
export function extractMileageFromQuestion(question: string): number | null {
  // патерны с явным контекстом
  const ctx = /(?:сейчас|сегодня|на\s+данный\s+момент|пробег)[^\d]{0,15}(\d[\d\s.,]{2,12})\s*(?:км|k|к|тыс)?/i;
  const m = question.match(ctx);
  if (m) {
    const raw = m[1].replace(/[\s.,]/g, "");
    const n = Number(raw);
    if (Number.isFinite(n) && n > 1000 && n < 1_500_000) return n;
  }
  // "200к" / "200 000 км" одиночно
  const single = /(\d[\d\s]{3,10})\s*(?:км|к|k)/i;
  const m2 = question.match(single);
  if (m2) {
    const raw = m2[1].replace(/\s/g, "");
    const n = Number(raw);
    if (Number.isFinite(n) && n > 1000 && n < 1_500_000) return n;
  }
  return null;
}

/** Сборка краткой истории для подмешивания в системный промпт ИИ.
 *  currentMileageOverride — если пользователь явно указал актуальный пробег в вопросе. */
export function formatHistoryForPrompt(
  records: ServiceRecord[],
  currentMileageOverride?: number | null
): string {
  if (records.length === 0) return "";

  const today = new Date().toISOString().slice(0, 10);
  const latest = records[0];
  const currentMileage = currentMileageOverride ?? latest.mileage_km;
  const headLines = [
    currentMileage
      ? `АКТУАЛЬНЫЙ ПРОБЕГ: ${currentMileage.toLocaleString("ru-RU")} км${
          currentMileageOverride ? " (указан владельцем в вопросе)" : " (по последней записи)"
        }`
      : null,
    `Сегодня: ${fmtDate(today)}. Последняя запись: ${fmtDate(latest.date)}.`,
  ].filter(Boolean);

  const lines = records.slice(0, 30).map((r) => {
    const m = r.mileage_km ? `${r.mileage_km.toLocaleString("ru-RU")} км` : "-";
    const works = r.works.join("; ");

    // Готовая математика — чтобы AI не считал сам и не ошибался
    const sinceMonths = monthsBetween(r.date, today);
    const sinceKm = currentMileage && r.mileage_km ? currentMileage - r.mileage_km : null;
    const sinceBits: string[] = [];
    if (sinceMonths > 0) sinceBits.push(`${sinceMonths} мес. назад`);
    if (sinceKm != null && sinceKm > 0)
      sinceBits.push(`пробег с тех пор +${sinceKm.toLocaleString("ru-RU")} км`);
    const since = sinceBits.length > 0 ? `  [${sinceBits.join(", ")}]` : "";

    // Структурированные запчасти приоритетнее, fallback на materials
    let partsLine = "";
    if (r.parts && r.parts.length > 0) {
      partsLine = ` [запчасти: ${r.parts.map(fmtPart).join("; ")}]`;
    } else if (r.materials && r.materials.length > 0) {
      partsLine = ` [мат-лы: ${r.materials.join(", ")}]`;
    }

    const cost = r.cost_total ? ` [итого ${r.cost_total.toLocaleString("ru-RU")} ₽]` : "";
    return `- ${fmtDate(r.date)}, ${m}: ${works}${partsLine}${cost}${since}`;
  });

  return `ИСТОРИЯ МАШИНЫ ВЛАДЕЛЬЦА (Chevrolet Orlando):\n${headLines.join("\n")}\n\nРаботы (от свежих к старым, с готовыми интервалами):\n${lines.join("\n")}`;
}

/** Краткая сводка для UI: пробег + последняя работа. */
export type CarSummary = {
  totalRecords: number;
  currentMileage: number | null;
  lastDate: string | null;
  lastWorks: string[];
};

export function buildSummary(records: ServiceRecord[]): CarSummary {
  if (records.length === 0) {
    return { totalRecords: 0, currentMileage: null, lastDate: null, lastWorks: [] };
  }
  const latest = records[0];
  return {
    totalRecords: records.length,
    currentMileage: latest.mileage_km,
    lastDate: latest.date,
    lastWorks: latest.works.slice(0, 3),
  };
}
