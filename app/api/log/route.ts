import { NextResponse } from "next/server";
import { parseFreeText } from "@/lib/parse-record";
import { insertServiceRecord } from "@/lib/car";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function checkAuth(req: Request): boolean {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return true; // если ключ не задан в env — пускаем всех (MVP)
  const got = req.headers.get("x-admin-key");
  return got === expected;
}

export async function POST(req: Request) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
