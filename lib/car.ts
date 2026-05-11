import { httpGet, httpPost } from "./http";

export type ServiceRecord = {
  id: string;
  date: string; // YYYY-MM-DD
  mileage_km: number | null;
  works: string[];
  materials: string[];
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

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

/** Сборка краткой истории для подмешивания в системный промпт ИИ. */
export function formatHistoryForPrompt(records: ServiceRecord[]): string {
  if (records.length === 0) return "";

  const latest = records[0];
  const head = latest.mileage_km
    ? `Текущий пробег (по последней записи): ${latest.mileage_km.toLocaleString("ru-RU")} км (${fmtDate(latest.date)})`
    : `Последняя запись: ${fmtDate(latest.date)}`;

  const lines = records.slice(0, 30).map((r) => {
    const m = r.mileage_km ? `${r.mileage_km.toLocaleString("ru-RU")} км` : "-";
    const works = r.works.join("; ");
    const mats = r.materials.length > 0 ? ` [мат-лы: ${r.materials.join(", ")}]` : "";
    const cost = r.cost_total ? ` [${r.cost_total.toLocaleString("ru-RU")} ₽]` : "";
    return `- ${fmtDate(r.date)}, ${m}: ${works}${mats}${cost}`;
  });

  return `ИСТОРИЯ МАШИНЫ ВЛАДЕЛЬЦА (Chevrolet Orlando):\n${head}\n\nРаботы (от свежих к старым):\n${lines.join("\n")}`;
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
