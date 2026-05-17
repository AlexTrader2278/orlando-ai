import { NextResponse } from "next/server";
import { parseFreeText, validateParsedRecord, type ParsedRecord } from "@/lib/parse-record";
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Два шага вместо одного «распознал и сразу записал»:
 *  - { text }                     → распарсить + проверить, ВЕРНУТЬ превью, в БД НЕ писать;
 *  - { confirm: true, record }    → проверить подтверждённую запись и записать в БД.
 */
export async function POST(req: Request) {
  try {
    const auth = checkAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      text?: string;
      confirm?: boolean;
      record?: ParsedRecord;
    };

    // --- Шаг 2: подтверждённая запись от пользователя → пишем в БД ---
    if (body.confirm && body.record) {
      const v = validateParsedRecord(body.record, today());
      if (!v.ok) {
        return NextResponse.json({ error: v.error }, { status: 422 });
      }
      const inserted = await insertServiceRecord({
        date: v.record.date,
        mileage_km: v.record.mileage_km,
        works: v.record.works,
        materials: v.record.materials,
        parts: v.record.parts,
        cost_works: v.record.cost_works,
        cost_materials: v.record.cost_materials,
        cost_total: v.record.cost_total,
        notes: v.record.notes,
        source: "manual",
      });
      return NextResponse.json({ ok: true, record: inserted });
    }

    // --- Шаг 1: свободный текст → распознать и вернуть превью (без записи) ---
    const text = body.text;
    if (!text || typeof text !== "string" || text.trim().length < 5) {
      return NextResponse.json({ error: "text too short" }, { status: 400 });
    }

    const parsed = await parseFreeText(text.trim(), today());
    const v = validateParsedRecord(parsed, today());
    if (!v.ok) {
      return NextResponse.json({ error: v.error, parsed }, { status: 422 });
    }
    return NextResponse.json({ ok: true, preview: v.record });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
