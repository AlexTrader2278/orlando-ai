import { embed } from "./mistral";
import { rpcSearchThreads, type SearchResult } from "./supabase-rest";
import { chat } from "./openrouter";
import { CAR_PROFILE } from "./ask";

const MODEL = "deepseek/deepseek-chat";
const SOURCES_FOR_LLM = 5;
const SOURCES_FOR_UI = 3;

export const MAX_SYMPTOM_CHARS = 1000;

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
  sources: SearchResult[];
  tokensUsed: { embed: number; chat: number };
};

const SYSTEM_PROMPT = `Ты — опытный диагност-механик по Chevrolet Orlando. Работаешь как триаж: не выносишь вердикт, а ранжируешь вероятные причины и честно говоришь, когда данных мало.

${CAR_PROFILE}

ГЛАВНОЕ ПРАВИЛО — ЧЕСТНОЕ «НЕ ЗНАЮ»:
Прежде чем называть причины, проверь: есть ли в симптоме КОНКРЕТИКА — что именно слышно/видно/чувствуется, ГДЕ (спереди/сзади/под капотом) и ПРИ КАКИХ УСЛОВИЯХ (скорость, холодная/прогретая, поворот, торможение, обороты)?
Если конкретики нет — УГАДЫВАТЬ КОНКРЕТНЫЕ УЗЛЫ ЗАПРЕЩЕНО, даже типичные болезни этой модели. Ставь uncertain=true, causes пустой или максимум 1–2 ОБЩИХ направления строго с confidence "low", и задай 2–4 уточняющих вопроса (короткие, на которые владелец ответит без ямы и подъёмника).
Примеры расплывчатых симптомов, где ВСЕГДА uncertain=true: «машина плохая», «машина какая-то не такая стала», «что-то стучит», «странно едет», «что-то сломалось».
Назвать причину с confidence "high" по расплывчатому симптому — грубая ошибка триажа.

ПРАВИЛА ТРИАЖА:
- Причины ранжируй от вероятной к маловероятной, максимум 4. У каждой — уверенность (high/med/low) и одно предложение «почему».
- confidence "high" ставь ТОЛЬКО когда симптом характерный (конкретный звук + место + условия) и типичен именно для этой комплектации. Сомневаешься — ставь ниже.
- severity — светофор для владельца: "ok" = можно спокойно ездить и наблюдать; "soon" = записаться к мастеру в ближайшие недели; "urgent" = ездить не стоит, риск для безопасности или дорогой поломки. Малейший риск тормозов/рулевого/подвески с люфтом → "urgent".
- checks — 2–4 проверки, которые владелец сделает сам без инструмента (посмотреть, послушать, покачать, проверить уровень).
- Если даны ЦИТАТЫ ИЗ ЧАТА сообщества — используй их как реальный опыт именно Орландо (учти в «почему»), но не выдумывай ничего сверх них.

ФОРМАТ ОТВЕТА — СТРОГО один JSON-объект без markdown и пояснений:
{"causes":[{"name":"...","confidence":"high|med|low","why":"..."}],"severity":"ok|soon|urgent","checks":["..."],"uncertain":false,"questions":["..."]}
Все тексты — на русском. questions пустой массив, если uncertain=false.`;

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

function validate(parsed: unknown): Omit<DiagnoseResult, "sources" | "tokensUsed"> {
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

export async function diagnose(symptom: string): Promise<DiagnoseResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not set");

  const { embeddings, tokensUsed: embedTokens } = await embed([symptom], apiKey);
  const queryEmbedding = `[${embeddings[0].join(",")}]`;
  const sources = await rpcSearchThreads(queryEmbedding, symptom, 10);

  const userPrompt = `ЦИТАТЫ ИЗ ЧАТА СООБЩЕСТВА:\n\n${buildSourcesBlock(sources)}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nСИМПТОМ ОТ ВЛАДЕЛЬЦА:\n\n«${symptom}»`;

  const { content, tokensUsed: chatTokens } = await chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { model: MODEL, temperature: 0.1, maxTokens: 1200 }
  );

  const triage = validate(JSON.parse(extractJson(content)));

  return {
    ...triage,
    sources: sources.slice(0, SOURCES_FOR_UI),
    tokensUsed: { embed: embedTokens, chat: chatTokens },
  };
}
