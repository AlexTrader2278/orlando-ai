import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { handleUpdate, type TgUpdate } from "@/lib/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Hobby + Fluid compute: до 300 с. Фоновая работа (waitUntil) живёт в этих же пределах.
export const maxDuration = 300;

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Отвечаем Telegram сразу, а думаем уже после ответа. Иначе на долгом вопросе он не дожидается
  // (Read timeout expired), шлёт то же сообщение повторно, а бот получает две одинаковые задачи.
  waitUntil(
    handleUpdate(update).catch((e) => {
      console.error("telegram handler:", (e as Error).message);
    })
  );
  return NextResponse.json({ ok: true });
}
