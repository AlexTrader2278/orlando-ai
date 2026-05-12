import { NextResponse } from "next/server";
import { parseFreeText } from "@/lib/parse-record";
import { insertServiceRecord } from "@/lib/car";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function checkAuth(req: Request): { ok: boolean; reason?: string } {
  const expected = process.env.ADMIN_KEY;
  // Жёстко: без переменной окружения запись запрещена.
  if (!expected) return { ok: false, reason: "ADMIN_KEY is not configured on server" };
  const got = req.headers.get("x-admin-key");
  if (!got) return { ok: false, reason: "PIN required" };
  if (got !== expected) return { ok: false, reason: "Invalid PIN" };
  return { ok: true };
}

export async function POST(req: Request) {
  try {
    const auth = checkAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });
    }
    const { text } = (await req.json()) as { text?: string };
    if (!text || typeof text !== "string" || text.trim().length < 5) {
      return NextResponse.json({ error: "text too short" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const parsed = await parseFreeText(text.trim(), today);

    const inserted = await insertServiceRecord({
      date: parsed.date,
      mileage_km: parsed.mileage_km,
      works: parsed.works,
      materials: parsed.materials,
      parts: parsed.parts,
      cost_works: parsed.cost_works,
      cost_materials: parsed.cost_materials,
      cost_total: parsed.cost_total,
      notes: parsed.notes,
      source: "manual",
    });

    return NextResponse.json({ ok: true, record: inserted, parsed });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
