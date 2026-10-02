import { httpPost, httpDelete } from "./http";
import type { ParsedRecord } from "./parse-record";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TTL_MS = 24 * 60 * 60 * 1000;

export type PendingKind = "add" | "edit";
export type PendingPayload = { record: ParsedRecord; recordId?: string };
type PendingRow = { id: string; chat_id: number; kind: PendingKind; payload: PendingPayload; created_at: string };

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

export async function savePending(chatId: number, kind: PendingKind, payload: PendingPayload): Promise<string> {
  // Уборка просроченных черновиков — между делом, сбой не мешает сохранению.
  try {
    const cutoff = new Date(Date.now() - TTL_MS).toISOString();
    await httpDelete(sbUrl(`/rest/v1/bot_pending?created_at=lt.${encodeURIComponent(cutoff)}`), sbAuth(), 10_000);
  } catch {}

  const res = await httpPost(
    sbUrl("/rest/v1/bot_pending"),
    { chat_id: chatId, kind, payload },
    { ...sbAuth(), Prefer: "return=representation" },
    15_000
  );
  if (res.status >= 400) {
    throw new Error(`Supabase insert bot_pending ${res.status}: ${res.body.slice(0, 200)}`);
  }
  return (JSON.parse(res.body) as PendingRow[])[0].id;
}

/** Атомарно «взять и удалить»: второе нажатие на ту же кнопку получит null — дубля записи не будет. */
export async function takePending(id: string, chatId: number): Promise<PendingRow | null> {
  if (!UUID_RE.test(id)) return null;
  const res = await httpDelete(
    sbUrl(`/rest/v1/bot_pending?id=eq.${id}&chat_id=eq.${chatId}`),
    { ...sbAuth(), Prefer: "return=representation" },
    15_000
  );
  if (res.status >= 400) {
    throw new Error(`Supabase take bot_pending ${res.status}: ${res.body.slice(0, 200)}`);
  }
  const row = (JSON.parse(res.body) as PendingRow[])[0];
  if (!row) return null;
  if (Date.now() - new Date(row.created_at).getTime() > TTL_MS) return null;
  return row;
}
