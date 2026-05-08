import { NextResponse } from "next/server";
import { embed } from "@/lib/mistral";
import { rpcSearchThreads } from "@/lib/supabase-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { query, limit } = (await req.json()) as { query?: string; limit?: number };
    if (!query || typeof query !== "string" || query.trim().length < 3) {
      return NextResponse.json({ error: "query too short" }, { status: 400 });
    }

    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "MISTRAL_API_KEY missing" }, { status: 500 });
    }

    const { embeddings } = await embed([query.trim()], apiKey);
    const results = await rpcSearchThreads(
      `[${embeddings[0].join(",")}]`,
      query.trim(),
      Math.min(Math.max(limit ?? 15, 1), 30)
    );

    return NextResponse.json({ query, count: results.length, results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
