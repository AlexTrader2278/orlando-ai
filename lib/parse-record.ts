import { chat } from "./openrouter";

export type ParsedRecord = {
  date: string; // YYYY-MM-DD
  mileage_km: number | null;
  works: string[];
  materials: string[];
  cost_works: number | null;
  cost_materials: number | null;
  cost_total: number | null;
  notes: string | null;
};

const SYSTEM = `Ты — парсер записей об обслуживании авто. Получаешь свободное сообщение от владельца на русском и возвращаешь СТРОГО валидный JSON.

Поля:
- date: дата в формате YYYY-MM-DD. Правила распознавания:
  * Русский формат "ДД.ММ.ГГ" → день.месяц.год (например, "22.02.26" = 2026-02-22)
  * Русский формат "ДД.ММ.ГГГГ" → "22.02.2026" = 2026-02-22
  * Слитная запись "ДД/ММ/ГГ" или "ДД-ММ-ГГ" — то же правило
  * Словесная дата: "22 февраля 2026", "15 марта", "вчера", "позавчера", "на той неделе", "в прошлом году", "летом 2024" — выводи в YYYY-MM-DD как можешь
  * Месяцы по-русски: январь(01), февраль(02), март(03), апрель(04), май(05), июнь(06), июль(07), август(08), сентябрь(09), октябрь(10), ноябрь(11), декабрь(12)
  * Если год не указан явно — используй год из переданной "сегодня"
  * Если ДАТА вообще не упомянута — используй переданную "сегодня"
  * Если упомянуто "сегодня" — используй переданную "сегодня"
- mileage_km: пробег в км (целое число). Понимай "199к", "199.5к", "199 000 км", "200000". Если не указан — null.
- works: массив строк, что именно сделали (короткие нормализованные формулировки на русском).
- materials: массив строк, что использовали (бренд + объём/артикул если есть).
- cost_works: стоимость работ (число в рублях) или null.
- cost_materials: стоимость материалов (число в рублях) или null.
- cost_total: общая стоимость (число в рублях) или null. Если в сообщении только одна сумма без уточнения — клади в cost_total.
- notes: всё что не вошло в поля выше, или null.

Возвращай ТОЛЬКО JSON, без markdown-блоков, без комментариев.`;

export async function parseFreeText(text: string, today: string): Promise<ParsedRecord> {
  const userPrompt = `Сегодня: ${today}\n\nСообщение владельца:\n${text}`;

  const { content } = await chat(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: userPrompt },
    ],
    { model: "openai/gpt-4o-mini", temperature: 0.1, maxTokens: 800 }
  );

  // Иногда модели обрамляют ответ в ```json ... ``` — почистим.
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Partial<ParsedRecord>;
  return {
    date: parsed.date ?? today,
    mileage_km: parsed.mileage_km ?? null,
    works: Array.isArray(parsed.works) ? parsed.works.filter(Boolean) : [],
    materials: Array.isArray(parsed.materials) ? parsed.materials.filter(Boolean) : [],
    cost_works: parsed.cost_works ?? null,
    cost_materials: parsed.cost_materials ?? null,
    cost_total: parsed.cost_total ?? null,
    notes: parsed.notes ?? null,
  };
}
