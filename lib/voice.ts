import { chat } from "./openrouter";

const AUDIO_MODEL = "google/gemini-2.5-flash";
const SPEECH_MAX_CHARS = 1500;

export type VoiceAudio = { data: string; format: string };
export type VoiceHeard = {
  /** Дословная расшифровка человеческой речи; пустая строка, если речи нет. */
  speech: string;
  /** Отчётливо слышен звук самой машины (стук, скрежет, гул), а не просто фон. */
  mechanical: boolean;
};

const SYSTEM = `Ты расшифровываешь голосовые сообщения владельца Chevrolet Orlando (1.8 бензин F18D4, АКПП 6T40, ремень ГРМ).
Верни СТРОГО один JSON-объект без markdown и пояснений:
{"speech":"...","mechanical":true}

- speech — дословная расшифровка человеческой речи на русском, с нормальной пунктуацией. Если речи нет — пустая строка. Ничего не выдумывай и не дописывай от себя, неразборчивое пропускай. Автомобильные термины пиши правильно: КПП, АКПП, ГРМ, VVT, ШРУС, ТО, ОСАГО, ГУР.
- mechanical — true ТОЛЬКО если на записи отчётливо слышен звук самой машины (стук, скрежет, гул, свист, вой, треск двигателя, подвески, коробки). Голос, обычный фоновый шум, ветер, музыка — false.`;

/** Речь → текст (Gemini через OpenRouter). Одним запросом узнаём и что сказано, и есть ли на записи звук машины. */
export async function transcribeVoice(audio: VoiceAudio): Promise<VoiceHeard> {
  const { content } = await chat(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Расшифруй запись." },
          { type: "input_audio", input_audio: { data: audio.data, format: audio.format } },
        ],
      },
    ],
    { model: AUDIO_MODEL, temperature: 0, maxTokens: 1200 }
  );

  const raw = content.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const j = JSON.parse(raw.slice(start, end + 1)) as { speech?: unknown; mechanical?: unknown };
      return {
        speech: typeof j.speech === "string" ? j.speech.trim().slice(0, SPEECH_MAX_CHARS) : "",
        mechanical: j.mechanical === true,
      };
    } catch {}
  }
  // Модель ответила не JSON-ом, а просто текстом — считаем это расшифровкой (владелец увидит её эхом и поймёт, если не то).
  return { speech: raw.slice(0, SPEECH_MAX_CHARS), mechanical: false };
}
