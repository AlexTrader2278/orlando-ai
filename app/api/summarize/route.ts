import { NextResponse } from "next/server";
import { summarizeFindings } from "@/lib/summarize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_QUERY = 300;

export async function POST(req: Request) {
  try {
    const { question } = (await req.json()) as { question?: string };
    if (!question || typeof question !== "string" || question.trim().length < 2) {
      return NextResponse.json({ error: "question too short" }, { status: 400 });
    }
    const q = question.trim().slice(0, MAX_QUERY);
    const result = await summarizeFindings(q);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
