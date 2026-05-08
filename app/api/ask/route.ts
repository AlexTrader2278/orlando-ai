import { NextResponse } from "next/server";
import { askOrlando } from "@/lib/ask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { question } = (await req.json()) as { question?: string };
    if (!question || typeof question !== "string" || question.trim().length < 5) {
      return NextResponse.json({ error: "question too short" }, { status: 400 });
    }

    const result = await askOrlando(question.trim());
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
