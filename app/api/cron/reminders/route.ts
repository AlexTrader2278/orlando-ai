import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { runReminderCheck } from "@/lib/maintenance-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sha(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

/** Vercel Cron шлёт `Authorization: Bearer $CRON_SECRET`. Без секрета в env маршрут закрыт совсем. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  return timingSafeEqual(sha(given), sha(`Bearer ${secret}`));
}

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("forbidden", { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const r = await runReminderCheck(dry);
    return NextResponse.json({ ok: true, dry, sent: r.sent, items: r.items, ...(dry ? { text: r.text } : {}) });
  } catch (e) {
    console.error("cron reminders:", (e as Error).message);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
