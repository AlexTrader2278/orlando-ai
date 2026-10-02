import { NextResponse } from "next/server";
import { handleUpdate, type TgUpdate } from "@/lib/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new NextResponse("forbidden", { status: 403 });
  }

  // Всегда 200: на не-2xx Telegram повторяет апдейт и можно получить лавину дублей.
  try {
    const update = (await req.json()) as TgUpdate;
    await handleUpdate(update);
  } catch (e) {
    console.error("telegram handler:", (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}
