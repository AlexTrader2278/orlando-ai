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

const SYSTEM = `Ты — парсер записей об обслуживании авто. Получаешь свободное сообщение от владельца и возвращаешь СТРОГО валидный JSON.

Поля:
- date: дата в формате YYYY-MM-DD. Если не указана — используй переданную сегодняшнюю.
- mileage_km: пробег в км (целое число). Если не указан — null.
- works: массив строк, что именно сделали (короткие нормализованные формулировки на русском).
- materials: массив строк, что использовали (бренд + объём/артикул если есть).
- cost_works: стоимость работ (число) или null.
- cost_materials: стоимость материалов (число) или null.
- cost_total: общая стоимость (число) или null.
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
