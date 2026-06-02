import { NextResponse } from "next/server";
import { askSonar } from "@/lib/sonar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_QUERY = 500;

export async function POST(req: Request) {
  try {
    const { question } = (await req.json()) as { question?: string };
    if (!question || typeof question !== "string" || question.trim().length < 5) {
      return NextResponse.json({ error: "question too short" }, { status: 400 });
    }
    const q = question.trim().slice(0, MAX_QUERY);
    const result = await askSonar(q);
    // Возвращаем те же поля что и /api/ask, плюс citations.
    return NextResponse.json({
      answer: result.answer,
      sources: [],
      citations: result.citations,
      tokensUsed: { embed: 0, chat: result.tokensUsed },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
