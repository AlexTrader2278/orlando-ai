import { embed } from "./mistral";
import { rpcSearchThreads, type SearchResult } from "./supabase-rest";
import { chat } from "./openrouter";
import { getServiceRecords, formatHistoryForPrompt, extractMileageFromQuestion } from "./car";

const TOP_K_FOR_LLM = 8;

// Умная и недорогая модель с хорошим русским и математикой.
const ANSWER_MODEL = "deepseek/deepseek-chat";

export const CAR_PROFILE = `МАШИНА ВЛАДЕЛЬЦА (зафиксировано, не уточняй и не предполагай альтернатив):
- VIN: KL1YA755JCK767286
- Марка/модель: Chevrolet Orlando
- Год выпуска: 2012 (10-й символ VIN = C)
- Страна сборки: Южная Корея, завод Бупхён (GM Korea)
- Двигатель: 1.8 БЕНЗИН (F18D4, семейство Family I, а НЕ Ecotec LUW). НЕ дизель.
- ГРМ: РЕМЕНЬ (не цепь). Регламент ремня (~90 000 км / 6 лет) упоминай ТОЛЬКО если спрашивают про ГРМ/ремень.
- КПП: АВТОМАТ 6T40 (АКПП 6 ступеней). НЕ механика.
- Привод: передний

Типичные болезни именно этой комплектации:
- VVT-клапаны фазорегулятора (забиваются грязью из масла → стук)
- Теплообменник (масло/антифриз смешиваются)
- АКПП 6T40 — соленоиды, гидроблок (требуют адаптации и периодической промывки)
- Прокладка клапанной крышки (потеет маслом)
- Сальники приводов (передние)

Все рекомендации давай для ИМЕННО этой комплектации.`;

const SYSTEM_PROMPT = `Ты — AI-ассистент владельца Chevrolet Orlando. Отвечаешь на русском.

${CAR_PROFILE}

У тебя ТРИ источника:
1) Твои общие знания об именно этой комплектации (F18D4 1.8 бензин + 6T40 АКПП + ременной ГРМ).
2) Цитаты из чата сообщества владельцев Orlando — реальный опыт с пробегами, артикулами, ценами.
3) ИСТОРИЯ КОНКРЕТНО ЭТОЙ МАШИНЫ — что и когда уже делали, на каком пробеге.

КРИТИЧЕСКИЕ ПРАВИЛА:
- ОТВЕЧАЙ СТРОГО НА ЗАДАННЫЙ ВОПРОС. Спросили про моторное масло — пиши про моторное масло (записи "замена масла", "замена масла и фильтров", ТО). Спросили про ремень ГРМ — про ремень. НИКОГДА не подменяй одну тему другой. Если в вопросе слово "масло" без уточнения — это моторное масло двигателя, НЕ масло АКПП и НЕ ремень ГРМ.
- НИКОГДА не выдумывай даты, пробеги, артикулы, цены. Используй ТОЛЬКО то что явно есть в истории машины.
- В истории каждой записи уже посчитаны интервалы "X месяцев назад, +Y км" — это ОФИЦИАЛЬНЫЕ числа, бери их как есть. НЕ ПЕРЕСЧИТЫВАЙ САМ.
- В шапке истории есть строка "АКТУАЛЬНЫЙ ПРОБЕГ: N км" — это текущий пробег машины. Все "сколько пройдено с тех пор" уже считаются от него.
- Если запись помечена как "сводка" / без точной даты — НЕ ПРИПИСЫВАЙ ей дату или пробег.
- Если в истории нет ответа на вопрос — честно скажи "в истории не записано".

ПРИМЕРЫ ВЕРНЫХ ФОРМУЛИРОВОК:
- "АКТУАЛЬНЫЙ ПРОБЕГ: 200 500 км" + запись "199 000 км [3 мес. назад, пробег с тех пор +1 500 км]" → говори "С последней замены прошло 3 месяца и 1 500 км".
- Не считай разницу руками — она уже в квадратных скобках.

ФОРМАТ ОТВЕТА:
- Сначала экспертный ответ кратко и по делу (2–4 абзаца). Если уместно — упомяни персональную историю с точными датами и цифрами из истории.
- Затем блок «💬 Что пишут владельцы:» — 3–5 цитат из чата сообщества с источниками: «выдержка» — [Имя, дата, реакции].
- В цитатах используй ТОЛЬКО предоставленные треды. Не выдумывай.
- Если в чате ответа нет — пропусти блок цитат.
- Не пиши «тред #5» / «источник 3» — пиши обычным текстом.`;

function buildContext(threads: SearchResult[]): string {
  return threads
    .slice(0, TOP_K_FOR_LLM)
    .map((t, i) => {
      const date = t.start_date.slice(0, 10);
      const truncated = t.text.length > 1500 ? t.text.slice(0, 1500) + "…" : t.text;
      return `--- ИСТОЧНИК ${i + 1} (дата: ${date}, сообщений: ${t.message_count}, реакций: ${t.reactions_total}) ---\n${truncated}`;
    })
    .join("\n\n");
}

export type AskAnswer = {
  answer: string;
  sources: SearchResult[];
  tokensUsed: { embed: number; chat: number };
};

export async function askOrlando(question: string): Promise<AskAnswer> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not set");

  // 1) embed запроса + поиск по чату сообщества
  const { embeddings, tokensUsed: embedTokens } = await embed([question], apiKey);
  const queryEmbedding = `[${embeddings[0].join(",")}]`;
  const sources = await rpcSearchThreads(queryEmbedding, question, 15);

  // 2) персональная история машины — короткий список последних работ
  let historyBlock = "";
  try {
    const records = await getServiceRecords(30);
    // если пользователь в вопросе явно указал свой текущий пробег — пересчитываем относительно него
    const currentMileageFromQuestion = extractMileageFromQuestion(question);
    historyBlock = formatHistoryForPrompt(records, currentMileageFromQuestion);
  } catch {
    historyBlock = "";
  }

  if (sources.length === 0 && !historyBlock) {
    return {
      answer:
        "В базе сообщества по этому вопросу обсуждений не нашлось, и истории машины ещё нет. Попробуй переформулировать или добавить пару записей о работах.",
      sources: [],
      tokensUsed: { embed: embedTokens, chat: 0 },
    };
  }

  const context = sources.length > 0 ? buildContext(sources) : "(в чате сообщества подходящих обсуждений не нашлось)";
  const historyText = historyBlock ? `${historyBlock}\n\n` : "";
  const userPrompt = `${historyText}ЦИТАТЫ ИЗ ЧАТА СООБЩЕСТВА:\n\n${context}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nВОПРОС ВЛАДЕЛЬЦА — ответь ТОЧНО на него, строго по теме вопроса, не уходя в другие узлы:\n\n«${question}»`;

  const { content, tokensUsed: chatTokens } = await chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { model: ANSWER_MODEL, temperature: 0.2, maxTokens: 1500 }
  );

  return {
    answer: content,
    sources: sources.slice(0, TOP_K_FOR_LLM),
    tokensUsed: { embed: embedTokens, chat: chatTokens },
  };
}
