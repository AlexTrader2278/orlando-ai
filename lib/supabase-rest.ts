import { httpGet, httpPost } from "./http";

function url(path: string): string {
  const base = process.env.SUPABASE_URL;
  if (!base) throw new Error("SUPABASE_URL is not set");
  return `${base}${path}`;
}

function authHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

export async function upsertThreads(rows: unknown[]): Promise<void> {
  const res = await httpPost(
    url("/rest/v1/threads?on_conflict=id"),
    rows,
    {
      ...authHeaders(),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    120_000
  );
  if (res.status >= 400) {
    throw new Error(`Supabase upsert ${res.status}: ${res.body.slice(0, 500)}`);
  }
}

export type SearchResult = {
  id: string;
  text: string;
  start_date: string;
  end_date: string;
  message_count: number;
  participants_count: number;
  reactions_total: number;
  rrf_score: number;
};

export async function rpcSearchThreads(
  queryEmbedding: string,
  queryText: string,
  matchCount: number
): Promise<SearchResult[]> {
  const res = await httpPost(
    url("/rest/v1/rpc/search_threads"),
    {
      query_embedding: queryEmbedding,
      query_text: queryText,
      match_count: matchCount,
    },
    authHeaders(),
    30_000
  );
  if (res.status >= 400) {
    throw new Error(`Supabase rpc ${res.status}: ${res.body.slice(0, 500)}`);
  }
  return JSON.parse(res.body);
}

export async function smokeCount(): Promise<number> {
  const res = await httpGet(url("/rest/v1/threads?select=id&limit=1"), authHeaders(), 10_000);
  if (res.status >= 400) throw new Error(`Supabase ${res.status}: ${res.body}`);
  const arr = JSON.parse(res.body);
  return Array.isArray(arr) ? arr.length : 0;
}
