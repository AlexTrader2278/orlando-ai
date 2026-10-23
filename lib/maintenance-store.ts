import { httpGet, httpPost } from "./http";
import type { OdometerReading, ReminderLogRow } from "./maintenance-plan";

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

/** Таблицы создаёт миграция 0006. Пока её не выполнили, бот работает без показаний и журнала, а не падает. */
function isMissingTable(status: number, body: string): boolean {
  return status === 404 || /PGRST205|42P01|does not exist|schema cache/i.test(body);
}

export async function getLatestOdometer(): Promise<OdometerReading | null> {
  const res = await httpGet(
    sbUrl("/rest/v1/odometer_readings?select=date,km&order=date.desc,km.desc&limit=1"),
    sbAuth(),
    15_000
  );
  if (res.status >= 400) {
    if (isMissingTable(res.status, res.body)) return null;
    throw new Error(`Supabase get odometer_readings ${res.status}: ${res.body.slice(0, 200)}`);
  }
  return (JSON.parse(res.body) as OdometerReading[])[0] ?? null;
}

export async function saveOdometer(km: number, date: string): Promise<void> {
  const res = await httpPost(sbUrl("/rest/v1/odometer_readings"), { km, date }, { ...sbAuth(), Prefer: "return=minimal" }, 15_000);
  if (res.status >= 400) {
    if (isMissingTable(res.status, res.body)) {
      throw new Error("Таблица odometer_readings не создана: выполните supabase/migrations/0006_maintenance.sql в SQL Editor.");
    }
    throw new Error(`Supabase insert odometer_readings ${res.status}: ${res.body.slice(0, 200)}`);
  }
}

export async function getReminderLog(): Promise<ReminderLogRow[]> {
  const res = await httpGet(sbUrl("/rest/v1/reminder_log?select=*"), sbAuth(), 15_000);
  if (res.status >= 400) {
    if (isMissingTable(res.status, res.body)) return [];
    throw new Error(`Supabase get reminder_log ${res.status}: ${res.body.slice(0, 200)}`);
  }
  return JSON.parse(res.body) as ReminderLogRow[];
}

export type ReminderLogUpsert = {
  item_id: string;
  last_status: ReminderLogRow["last_status"];
  notified_at?: string;
  snoozed_until?: string | null;
};

/** Вставка или обновление строки пункта (on_conflict по item_id); при совпадении меняются только переданные поля. */
export async function upsertReminderLog(rows: ReminderLogUpsert[]): Promise<void> {
  if (rows.length === 0) return;
  const res = await httpPost(
    sbUrl("/rest/v1/reminder_log?on_conflict=item_id"),
    rows,
    { ...sbAuth(), Prefer: "resolution=merge-duplicates,return=minimal" },
    15_000
  );
  if (res.status >= 400) {
    if (isMissingTable(res.status, res.body)) {
      throw new Error("Таблица reminder_log не создана: выполните supabase/migrations/0006_maintenance.sql в SQL Editor.");
    }
    throw new Error(`Supabase upsert reminder_log ${res.status}: ${res.body.slice(0, 200)}`);
  }
}

export async function snoozeItem(itemId: string, untilIso: string, status: ReminderLogRow["last_status"]): Promise<void> {
  await upsertReminderLog([{ item_id: itemId, last_status: status, snoozed_until: untilIso }]);
}
