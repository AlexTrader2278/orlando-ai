/**
 * Проверка чтения фото документа: фото → текст → запись. Показывает всё, что увидела модель, и сверяет суммы.
 * Запуск:  npm run photo-check -- путь\к\фото.jpg
 */
import { readFileSync } from "node:fs";
import { readDocumentPhoto } from "../lib/photo";
import { parseFreeText } from "../lib/parse-record";

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Укажите путь к фото: npm run photo-check -- файл.jpg");
  const mime = /\.png$/i.test(path) ? "image/png" : /\.webp$/i.test(path) ? "image/webp" : "image/jpeg";
  const text = await readDocumentPhoto({ data: readFileSync(path).toString("base64"), mime });
  console.log("=== ТЕКСТ С ФОТО ===\n" + text + "\n");
  const rec = await parseFreeText(`Текст с фото документа:\n${text}`, new Date().toISOString().slice(0, 10));
  console.log("=== ЗАПИСЬ ===\n" + JSON.stringify(rec, null, 2) + "\n");

  const partsSum = rec.parts.reduce((s, p) => s + (p.qty ?? 1) * (p.price ?? 0), 0);
  const qty = rec.parts.reduce((s, p) => s + (p.qty ?? 1), 0);
  console.log(`Работ: ${rec.works.length}; позиций материалов: ${rec.parts.length}, штук: ${qty}`);
  console.log(`Сумма материалов по строкам: ${partsSum}; в записи cost_materials: ${rec.cost_materials}`);
  console.log(`cost_works + cost_materials = ${(rec.cost_works ?? 0) + (rec.cost_materials ?? 0)}; cost_total: ${rec.cost_total}`);
}
main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
