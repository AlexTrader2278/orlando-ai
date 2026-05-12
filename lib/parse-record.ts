import { chat } from "./openrouter";
import type { ServicePart } from "./types";

export type ParsedRecord = {
  date: string; // YYYY-MM-DD
  mileage_km: number | null;
  works: string[];
  materials: string[];
  parts: ServicePart[];
  cost_works: number | null;
  cost_materials: number | null;
  cost_total: number | null;
  notes: string | null;
};

const SYSTEM = `Ты — парсер записей об обслуживании авто. Получаешь свободное сообщение от владельца на русском и возвращаешь СТРОГО валидный JSON.

Поля:
- date: дата в формате YYYY-MM-DD. Правила:
  * "ДД.ММ.ГГ" → "22.02.26" = 2026-02-22 (ДД.ММ.ГГГГ так же)
  * "/" и "-" как разделители — то же правило
  * "22 февраля 2026" / "15 марта" / "вчера" / "позавчера" / "в прошлом году" / "летом 2024" — выводи в YYYY-MM-DD
  * Месяцы по-русски: январь=01, февраль=02, март=03, апрель=04, май=05, июнь=06, июль=07, август=08, сентябрь=09, октябрь=10, ноябрь=11, декабрь=12
  * Если год не указан — используй год из переданной "сегодня"
  * Если дата вообще не упомянута — используй "сегодня"

- mileage_km: пробег (целое число). Понимай "199к", "199.5к", "199 000 км", "200000". Если не указан — null.

- works: массив коротких операций на русском, что именно сделали.
  Примеры: ["Замена моторного масла", "Замена масляного фильтра", "Замена тормозных колодок передних"]

- parts: массив структурированных запчастей/материалов. Для каждой детали верни объект:
  {
    "name": "масляный фильтр" | "масло 5W-30" | "колодки тормозные" | ...,
    "brand": "Mann" | "Mobil 1" | "Brembo" | null (если бренд не назван),
    "article": "W914" | "GM 25193400" | "P59041" | null (артикул, OEM-номер если есть),
    "qty": 1 | 4 | null (количество),
    "unit": "шт" | "л" | "кг" | null,
    "price": 800 | 2400 | null (цена в рублях за позицию)
  }
  Если в сообщении деталь упомянута без артикула/цены — всё равно создай объект с тем что есть.

- materials: массив строк (для обратной совместимости). Сгенерируй из parts человекочитаемое представление: "Mann W914, 1 шт", "Mobil 1 5W-30, 4 л".

- cost_works: стоимость работ (число в рублях) или null.
- cost_materials: стоимость материалов (число в рублях) или null.
- cost_total: общая стоимость или null. Если в сообщении одна сумма без уточнения — клади её сюда.
- notes: всё что не вошло в поля выше, или null.

Возвращай ТОЛЬКО JSON, без markdown-блоков, без комментариев, без префикса.`;

export async function parseFreeText(text: string, today: string): Promise<ParsedRecord> {
  const userPrompt = `Сегодня: ${today}\n\nСообщение владельца:\n${text}`;

  const { content } = await chat(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: userPrompt },
    ],
    { model: "openai/gpt-4o-mini", temperature: 0.1, maxTokens: 1200 }
  );

  // Иногда модели обрамляют ответ в ```json ... ``` — почистим.
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Partial<ParsedRecord>;

  const parts: ServicePart[] = Array.isArray(parsed.parts)
    ? parsed.parts
        .filter((p): p is ServicePart => Boolean(p && typeof p === "object" && (p as ServicePart).name))
        .map((p) => ({
          name: p.name,
          brand: p.brand ?? null,
          article: p.article ?? null,
          qty: p.qty ?? null,
          unit: p.unit ?? null,
          price: p.price ?? null,
          notes: p.notes ?? null,
        }))
    : [];

  return {
    date: parsed.date ?? today,
    mileage_km: parsed.mileage_km ?? null,
    works: Array.isArray(parsed.works) ? parsed.works.filter(Boolean) : [],
    materials: Array.isArray(parsed.materials) ? parsed.materials.filter(Boolean) : [],
    parts,
    cost_works: parsed.cost_works ?? null,
    cost_materials: parsed.cost_materials ?? null,
    cost_total: parsed.cost_total ?? null,
    notes: parsed.notes ?? null,
  };
}
