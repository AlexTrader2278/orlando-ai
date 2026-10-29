import { chat } from "./openrouter";

/** То же, что для голоса: быстрая и дешёвая модель с хорошим русским и зрением. */
const VISION_MODEL = "google/gemini-2.5-flash";
const TEXT_MAX_CHARS = 8000;
const NO_TEXT = "НЕТ_ТЕКСТА";

export type DocumentImage = { data: string; mime: string };

const SYSTEM = `Ты переписываешь текст с фотографии автомобильного документа: заказ-наряд, расходная накладная, чек, акт выполненных работ, страница сервисной книжки.
Верни ТОЛЬКО текст документа, как он напечатан или написан, без пояснений, без markdown и без своих комментариев.

Правила:
- Сохраняй порядок строк и разделов. Каждую строку таблицы пиши в одну строку, поля разделяй « | ».
- Цифры, артикулы, количество, цены, суммы, итоги, дату и номер документа переписывай символ в символ. Пробег — если он указан.
- Ничего не считай, не исправляй и не додумывай. Нечитаемое помечай [?], не угадывай.
- Если на фото нет читаемого документа или текста — верни ровно: ${NO_TEXT}`;

/** Фото документа → текст (Gemini через OpenRouter). Пустая строка — на фото нет читаемого текста. */
export async function readDocumentPhoto(img: DocumentImage): Promise<string> {
  const { content } = await chat(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Перепиши текст с этого фото." },
          { type: "image_url", image_url: { url: `data:${img.mime};base64,${img.data}` } },
        ],
      },
    ],
    // Gemini 2.5 тратит часть лимита на «размышления», поэтому запас большой.
    { model: VISION_MODEL, temperature: 0, maxTokens: 6000 }
  );
  const text = content.trim();
  if (text.includes(NO_TEXT) && text.length < NO_TEXT.length + 20) return "";
  return text.slice(0, TEXT_MAX_CHARS);
}
