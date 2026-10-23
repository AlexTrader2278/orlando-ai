/**
 * Проверка движка «План ТО» на реальной истории: по каждому пункту — на какую запись он опирается
 * и когда следующий срок. Расхождение с ожиданием видно глазами, без участия модели.
 *
 * Запуск:  npm run maint-check            (читает service_records из Supabase)
 *          npm run maint-check -- file.json  (массив записей из файла, без сети)
 */
import { readFileSync } from "node:fs";
import { getServiceRecords, type ServiceRecord } from "../lib/car";
import { computePlan } from "../lib/maintenance-plan";

const ICON = { ok: "✅", soon: "⚠️ ", overdue: "🔴", no_data: "❔" } as const;

async function main() {
  const file = process.argv[2];
  const records: ServiceRecord[] = file
    ? JSON.parse(readFileSync(file, "utf-8"))
    : await getServiceRecords(500);
  const today = new Date().toISOString().slice(0, 10);

  console.log(`Записей: ${records.length}. Сегодня: ${today}`);
  const { mileage, items } = computePlan(records, today);
  console.log(
    `Пробег: ${mileage.km ?? "—"} км (${mileage.estimated ? "оценка" : "факт"}), от ${mileage.asOf ?? "—"}, темп ${
      mileage.pacePerDay != null ? mileage.pacePerDay.toFixed(1) : "—"
    } км/сут\n`
  );

  for (const r of items) {
    const head = `${ICON[r.status]} ${r.item.title} [${r.item.source}] ${r.item.intervalKm ?? "—"} км / ${r.item.intervalMonths ?? "—"} мес.`;
    if (!r.basis) {
      console.log(`${head}\n     нет записей о замене\n`);
      continue;
    }
    console.log(
      `${head}\n     опора: ${r.basis.date}, ${r.basis.mileage_km ?? "пробег не записан"} км, «${r.basis.work}»${
        r.basis.loose ? " (расплывчато)" : ""
      }\n     срок: ${r.dueDate ?? "—"} (${r.daysLeft} дн.), ${r.dueKm ?? "—"} км (${r.kmLeft ?? "—"} км)\n`
    );
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
