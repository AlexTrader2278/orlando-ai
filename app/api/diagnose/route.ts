import { NextResponse } from "next/server";
import {
  diagnose,
  MAX_SYMPTOM_CHARS,
  MAX_AUDIO_BASE64_CHARS,
  AUDIO_FORMATS,
  type DiagnoseAudio,
} from "@/lib/diagnose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { symptom, audio } = (await req.json()) as { symptom?: string; audio?: DiagnoseAudio };

    const symptomText = typeof symptom === "string" ? symptom.trim() : "";
    const hasSymptom = symptomText.length >= 5;
    if (symptomText.length > MAX_SYMPTOM_CHARS) {
      return NextResponse.json({ error: `symptom too long (max ${MAX_SYMPTOM_CHARS})` }, { status: 400 });
    }

    let audioInput: DiagnoseAudio | undefined;
    if (audio) {
      if (typeof audio.data !== "string" || typeof audio.format !== "string") {
        return NextResponse.json({ error: "bad audio payload" }, { status: 400 });
      }
      if (!AUDIO_FORMATS.has(audio.format)) {
        return NextResponse.json({ error: `audio format must be one of: ${[...AUDIO_FORMATS].join(", ")}` }, { status: 400 });
      }
      if (audio.data.length < 1000) {
        return NextResponse.json({ error: "audio too short" }, { status: 400 });
      }
      if (audio.data.length > MAX_AUDIO_BASE64_CHARS) {
        return NextResponse.json({ error: "audio too large (max ~15 sec)" }, { status: 400 });
      }
      audioInput = { data: audio.data, format: audio.format };
    }

    if (!hasSymptom && !audioInput) {
      return NextResponse.json({ error: "symptom too short" }, { status: 400 });
    }

    const result = await diagnose(symptomText, audioInput);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
