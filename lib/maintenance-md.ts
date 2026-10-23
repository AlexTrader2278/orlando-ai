import type { CurrentMileage, ItemResult } from "./maintenance-plan";
import { esc, cell } from "./tgrich";

const ICON: Record<ItemResult["status"], string> = { ok: "✅", soon: "⚠️", overdue: "🔴", no_data: "❔" };

export function ruDate(iso: string): string {
  return iso.slice(0, 10).split("-").reverse().join(".");
}

function fmtKm(km: number): string {
  return `${km.toLocaleString("ru-RU")} км`;
}

/** «на 3 мес.», «на 2 г. 4 мес.», «на 12 дн.» — сколько просрочено/осталось по времени. */
function spanRu(days: number): string {
  const d = Math.abs(days);
  if (d < 60) return `${d} дн.`;
  const months = Math.round(d / 30.4);
  if (months < 24) return `${months} мес.`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y} г. ${m} мес.` : `${y} г.`;
}

function dueText(r: ItemResult): string {
  const bits: string[] = [];
  if (r.dueDate) bits.push(`до ${ruDate(r.dueDate)}`);
  if (r.dueKm != null) bits.push(`${r.dueKm.toLocaleString("ru-RU")} км`);
  return bits.join(" / ") || "—";
}

function leftText(r: ItemResult): string {
  const bits: string[] = [];
  if (r.daysLeft != null) bits.push(r.daysLeft < 0 ? `просрочено на ${spanRu(r.daysLeft)}` : `ещё ${spanRu(r.daysLeft)}`);
  if (r.kmLeft != null) bits.push(r.kmLeft < 0 ? `+${fmtKm(-r.kmLeft)}` : `ещё ~${fmtKm(r.kmLeft)}`);
  return bits.join(", ");
}

export function mileageLine(m: CurrentMileage): string {
  if (m.km == null) return "Пробег неизвестен — пришли число ответом на это сообщение.";
  return m.estimated
    ? `Пробег сейчас ≈ **${fmtKm(m.km)}** (оценка по вашему темпу ~${m.pacePerDay != null ? Math.round(m.pacePerDay * 30) : "?"} км/мес.; последняя запись ${m.asOf ? ruDate(m.asOf) : "—"})`
    : `Пробег: **${fmtKm(m.km)}** (на ${m.asOf ? ruDate(m.asOf) : "—"})`;
}

/** «План ТО» по запросу: всё по пунктам, с опорой на запись, чтобы владелец мог проверить расчёт глазами. */
export function mdPlan(mileage: CurrentMileage, items: ItemResult[]): string {
  const known = items.filter((r) => r.status !== "no_data");
  const unknown = items.filter((r) => r.status === "no_data");
  const attention = known.filter((r) => r.status !== "ok");

  const rows = known.map((r) => {
    const b = r.basis!;
    const done = `${ruDate(b.date)}${b.mileage_km != null ? ` · ${b.mileage_km.toLocaleString("ru-RU")} км` : ""}${b.loose ? " ~" : ""}`;
    return `| ${ICON[r.status]} | ${cell(r.item.title)} | ${cell(done)} | ${cell(dueText(r))}${r.status === "ok" ? "" : `<br>**${cell(leftText(r))}**`} |`;
  });

  const head = attention.length
    ? `Внимания требуют: ${attention.map((r) => esc(r.item.title.toLowerCase())).join(", ")}.`
    : "Всё по регламенту в порядке.";

  const parts = [
    "## 🔔 План ТО",
    mileageLine(mileage),
    head,
    "| | Что | Последний раз | Следующий |\n|:-:|:--|:--|:--|\n" + rows.join("\n"),
    "Срок считаю от вашей **последней фактической замены**: если сделали раньше регламента, это учтено и ничего не просрочено. Знак «~» — в записи было «масло и фильтры» без уточнения, считаю вероятным.",
  ];

  if (unknown.length) {
    parts.push(
      `<details><summary>❔ Нет записей в книжке (${unknown.length})</summary>\n\n${unknown
        .map((r) => `- ${esc(r.item.title)} — ${r.item.intervalKm?.toLocaleString("ru-RU") ?? "—"} км / ${r.item.intervalMonths ?? "—"} мес.`)
        .join("\n")}\n\nЕсли это делали — запишите через «✍️ Записать работу», и я начну отсчёт.\n\n</details>`
    );
  }

  const sources = items
    .map((r) => `- **${esc(r.item.title)}** (${r.item.source}): ${esc(r.item.note)}`)
    .join("\n");
  parts.push(
    `<details><summary>📚 Откуда интервалы</summary>\n\nЭто ориентиры из открытых источников, а не документ завода — сверяйте с бумажной книжкой.\n\n${sources}\n\n</details>`
  );

  return parts.join("\n\n");
}

/** Напоминание «скоро/просрочено»: кратко по пунктам, с опорой на запись — можно проверить расчёт. */
export function mdDigest(mileage: CurrentMileage, items: ItemResult[]): string {
  const lines = items.map((r) => {
    const b = r.basis!;
    const done = `${ruDate(b.date)}${b.mileage_km != null ? ` · ${b.mileage_km.toLocaleString("ru-RU")} км` : ""}${b.loose ? " (вероятно, в записи «масло и фильтры»)" : ""}`;
    return `${ICON[r.status]} **${esc(r.item.title)}** — ${r.status === "overdue" ? "" : r.urgent ? "меньше месяца, " : "пора планировать, "}${esc(leftText(r))} (срок ${esc(dueText(r))}).\nПоследний раз: ${esc(done)}.`;
  });
  return [
    "## 🔔 Пора подумать о ТО",
    lines.join("\n\n"),
    mileageLine(mileage),
    "Уже делали? Нажмите «✓ Делал» — запишу, и отсчёт пойдёт заново. Точный пробег можно прислать числом, например «206500».",
  ].join("\n\n");
}
