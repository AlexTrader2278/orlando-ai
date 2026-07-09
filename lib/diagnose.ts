import { embed } from "./mistral";
import { rpcSearchThreads, type SearchResult } from "./supabase-rest";
import { chat } from "./openrouter";
import { CAR_PROFILE } from "./ask";
import { getServiceRecords, formatHistoryForPrompt, extractMileageFromQuestion } from "./car";

const MODEL = "deepseek/deepseek-chat";
const AUDIO_MODEL = "google/gemini-2.5-flash";
const SOURCES_FOR_LLM = 5;
const SOURCES_FOR_UI = 3;

export const MAX_SYMPTOM_CHARS = 1000;
// ~1.5 МБ бинарного аудио (15 сек WAV 16 кГц моно ≈ 0.5 МБ) — с запасом, но не прокси для гигабайтов
export const MAX_AUDIO_BASE64_CHARS = 2_000_000;
export const AUDIO_FORMATS = new Set(["wav", "mp3"]);

export type DiagnoseAudio = { data: string; format: string };

export type DiagnoseCause = {
  name: string;
  confidence: "high" | "med" | "low";
  why: string;
};

export type DiagnoseResult = {
  causes: DiagnoseCause[];
  severity: "ok" | "soon" | "urgent";
  checks: string[];
  uncertain: boolean;
  questions: string[];
  soundDescription: string | null;
  soundError: string | null;
  sources: SearchResult[];
  tokensUsed: { embed: number; chat: number };
};

const SYSTEM_PROMPT = `Ты — опытный диагност-механик по Chevrolet Orlando. Работаешь как триаж: не выносишь вердикт, а ранжируешь вероятные причины и честно говоришь, когда данных мало.

${CAR_PROFILE}

ГЛАВНОЕ ПРАВИЛО — ЧЕСТНОЕ «НЕ ЗНАЮ»:
Прежде чем называть причины, проверь: есть ли в симптоме КОНКРЕТИКА — что именно слышно/видно/чувствуется, ГДЕ (спереди/сзади/под капотом) и ПРИ КАКИХ УСЛОВИЯХ (скорость, холодная/прогретая, поворот, торможение, обороты)? Техническое описание звука из аудиозаписи — тоже конкретика.
Если конкретики нет — УГАДЫВАТЬ КОНКРЕТНЫЕ УЗЛЫ ЗАПРЕЩЕНО, даже типичные болезни этой модели. Ставь uncertain=true, causes пустой или максимум 1–2 ОБЩИХ направления строго с confidence "low", и задай 2–4 уточняющих вопроса (короткие, на которые владелец ответит без ямы и подъёмника).
Примеры расплывчатых симптомов, где ВСЕГДА uncertain=true: «машина плохая», «машина какая-то не такая стала», «что-то стучит», «странно едет», «что-то сломалось».
Назвать причину с confidence "high" по расплывчатому симптому — грубая ошибка триажа.

ИСТОРИЯ ОБСЛУЖИВАНИЯ — ФИЛЬТР ВЕРОЯТНОСТЕЙ (если дана):
- Узел недавно менялся/обслуживался (малый срок и пробег с тех пор) → вероятность его отказа НИЖЕ обычной. Не выкидывай его молча: если симптом на него указывает, назови с пониженной уверенностью и оговоркой вида «менялся 2 мес./1 500 км назад — маловероятно, разве что брак детали или ошибка установки».
- Узел давно не обслуживался относительно регламента, и симптом типичен для его износа → вероятность ВЫШЕ; сошлись на интервал из истории в поле «почему».
- Интервалы «X мес. назад, +Y км» в истории уже посчитаны — бери их как есть, НЕ пересчитывай.
- Не выдумывай записи, которых нет в истории.

ПРАВИЛА ТРИАЖА:
- Причины ранжируй от вероятной к маловероятной, максимум 4. У каждой — уверенность (high/med/low) и одно предложение «почему».
- confidence "high" ставь ТОЛЬКО когда симптом характерный (конкретный звук + место + условия) и типичен именно для этой комплектации. Сомневаешься — ставь ниже.
- severity — светофор для владельца: "ok" = можно спокойно ездить и наблюдать; "soon" = записаться к мастеру в ближайшие недели; "urgent" = ездить не стоит, риск для безопасности или дорогой поломки. Малейший риск тормозов/рулевого/подвески с люфтом → "urgent".
- checks — 2–4 проверки, которые владелец сделает сам без инструмента (посмотреть, послушать, покачать, проверить уровень).
- Если даны ЦИТАТЫ ИЗ ЧАТА сообщества — используй их как реальный опыт именно Орландо (учти в «почему»), но не выдумывай ничего сверх них.

ФОРМАТ ОТВЕТА — СТРОГО один JSON-объект без markdown и пояснений:
{"causes":[{"name":"...","confidence":"high|med|low","why":"..."}],"severity":"ok|soon|urgent","checks":["..."],"uncertain":false,"questions":["..."]}
Все тексты — на русском. questions пустой массив, если uncertain=false.`;

const SOUND_SYSTEM_PROMPT = `Ты — автомеханик с идеальным слухом. Тебе дают запись звука автомобиля (Chevrolet Orlando, 1.8 бензин F18D4, АКПП). Опиши, что слышно, ТЕХНИЧЕСКИ и честно:
- характер звука (стук/цокот/скрежет/гул/свист/шелест/треск), металлический или глухой
- ритмичность: постоянный / периодический / зависит от оборотов
- на что похоже с точки зрения механики (не диагноз, а акустическое сходство)
- если на записи не слышно ничего механического (тишина, речь, ветер, музыка) — так и скажи прямо
4-6 предложений на русском, без вступлений и выводов о причинах.`;

function buildSourcesBlock(sources: SearchResult[]): string {
  if (sources.length === 0) return "(в чате сообщества похожих обсуждений не нашлось)";
  return sources
    .slice(0, SOURCES_FOR_LLM)
    .map((t, i) => {
      const date = t.start_date.slice(0, 10);
      const truncated = t.text.length > 1200 ? t.text.slice(0, 1200) + "…" : t.text;
      return `--- ОБСУЖДЕНИЕ ${i + 1} (${date}, сообщений: ${t.message_count}) ---\n${truncated}`;
    })
    .join("\n\n");
}

// LLM иногда заворачивает JSON в ```json … ``` — вырезаем первый {...} блок.
function extractJson(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`LLM вернул не-JSON: ${raw.slice(0, 200)}`);
  }
  return raw.slice(start, end + 1);
}

const CONFIDENCES = new Set(["high", "med", "low"]);
const SEVERITIES = new Set(["ok", "soon", "urgent"]);

type Triage = Pick<DiagnoseResult, "causes" | "severity" | "checks" | "uncertain" | "questions">;

function validate(parsed: unknown): Triage {
  const obj = parsed as Record<string, unknown>;
  const rawCauses = Array.isArray(obj.causes) ? obj.causes : [];
  const causes: DiagnoseCause[] = rawCauses
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      name: String(c.name ?? "").trim(),
      confidence: CONFIDENCES.has(String(c.confidence)) ? (String(c.confidence) as DiagnoseCause["confidence"]) : "low",
      why: String(c.why ?? "").trim(),
    }))
    .filter((c) => c.name.length > 0)
    .slice(0, 4);

  const severity = SEVERITIES.has(String(obj.severity)) ? (String(obj.severity) as DiagnoseResult["severity"]) : "soon";
  const checks = (Array.isArray(obj.checks) ? obj.checks : []).map(String).filter(Boolean).slice(0, 4);
  const uncertain = obj.uncertain === true;
  const questions = (Array.isArray(obj.questions) ? obj.questions : []).map(String).filter(Boolean).slice(0, 4);

  if (causes.length === 0 && !uncertain) {
    throw new Error("LLM не дал ни причин, ни признака неопределённости");
  }
  return { causes, severity, checks, uncertain, questions };
}

async function describeSound(audio: DiagnoseAudio): Promise<{ description: string; tokensUsed: number }> {
  const { content, tokensUsed } = await chat(
    [
      { role: "system", content: SOUND_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Вот запись. Опиши звук." },
          { type: "input_audio", input_audio: { data: audio.data, format: audio.format } },
        ],
      },
    ],
    { model: AUDIO_MODEL, temperature: 0.2, maxTokens: 400 }
  );
  const description = content.trim();
  if (!description) throw new Error("аудио-модель вернула пустой ответ");
  return { description, tokensUsed };
}

export async function diagnose(symptom: string, audio?: DiagnoseAudio): Promise<DiagnoseResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not set");

  // 1) звук → техническое описание (Gemini). Ошибка звука не валит текстовый путь.
  let soundDescription: string | null = null;
  let soundError: string | null = null;
  let audioTokens = 0;
  if (audio) {
    try {
      const r = await describeSound(audio);
      soundDescription = r.description;
      audioTokens = r.tokensUsed;
    } catch (e) {
      if (symptom.trim().length < 5) {
        throw new Error(`Звук распознать не удалось (${(e as Error).message.slice(0, 120)}). Опиши симптом словами.`);
      }
      soundError = "Звук распознать не удалось — диагноз только по описанию словами.";
    }
  }

  // 2) поиск по чату сообщества: симптом + описание звука
  const searchText = [symptom.trim(), soundDescription].filter(Boolean).join("\n");
  const { embeddings, tokensUsed: embedTokens } = await embed([searchText], apiKey);
  const queryEmbedding = `[${embeddings[0].join(",")}]`;
  const sources = await rpcSearchThreads(queryEmbedding, searchText, 10);

  // 3) история машины — фильтр вероятностей
  let historyBlock = "";
  try {
    const records = await getServiceRecords(30);
    historyBlock = formatHistoryForPrompt(records, extractMileageFromQuestion(symptom));
  } catch {
    historyBlock = "";
  }

  const promptParts = [
    historyBlock,
    soundDescription ? `ОПИСАНИЕ ЗВУКА С АУДИОЗАПИСИ (сделано аудио-моделью):\n${soundDescription}` : "",
    `ЦИТАТЫ ИЗ ЧАТА СООБЩЕСТВА:\n\n${buildSourcesBlock(sources)}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nСИМПТОМ ОТ ВЛАДЕЛЬЦА:\n\n«${symptom.trim() || "(словами не описал — только аудиозапись)"}»`,
  ].filter(Boolean);

  const { content, tokensUsed: chatTokens } = await chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: promptParts.join("\n\n") },
    ],
    { model: MODEL, temperature: 0.1, maxTokens: 1200 }
  );

  const triage = validate(JSON.parse(extractJson(content)));

  return {
    ...triage,
    soundDescription,
    soundError,
    sources: sources.slice(0, SOURCES_FOR_UI),
    tokensUsed: { embed: embedTokens, chat: chatTokens + audioTokens },
  };
}
