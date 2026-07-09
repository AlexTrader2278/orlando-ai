import { NextResponse } from "next/server";
import { diagnose, MAX_SYMPTOM_CHARS } from "@/lib/diagnose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { symptom } = (await req.json()) as { symptom?: string };
    if (!symptom || typeof symptom !== "string" || symptom.trim().length < 5) {
      return NextResponse.json({ error: "symptom too short" }, { status: 400 });
    }
    if (symptom.length > MAX_SYMPTOM_CHARS) {
      return NextResponse.json({ error: `symptom too long (max ${MAX_SYMPTOM_CHARS})` }, { status: 400 });
    }

    const result = await diagnose(symptom.trim());
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
