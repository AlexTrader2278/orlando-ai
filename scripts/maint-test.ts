/**
 * Проверка логики «План ТО» на синтетических записях (без сети и базы).
 * Запуск:  npm run maint-test
 */
import type { ServiceRecord } from "../lib/car";
import { computePlan, pickReminders, currentMileage, type ReminderLogRow } from "../lib/maintenance-plan";
import { parseOdometer } from "../lib/bot";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (!ok) failed++;
}

function rec(date: string, mileage_km: number | null, works: string[], materials: string[] = []): ServiceRecord {
  return { id: date, date, mileage_km, works, materials, parts: [], cost_works: null, cost_materials: null, cost_total: null, notes: null, source: "test", created_at: date };
}

const TODAY = "2026-10-23";
const get = (items: ReturnType<typeof computePlan>["items"], id: string) => items.find((r) => r.item.id === id)!;

// Пробег: две точки дают темп 20 км/сут.
const base = [rec("2026-01-01", 200_000, ["Диагностика"]), rec("2026-07-01", 203_620, ["Диагностика"])];

// 1. Масло сделали ЗА ПОЛГОДА до срока ТО — не «просрочено», срок считается от фактической замены.
{
  const { items } = computePlan([...base, rec("2026-05-01", 202_000, ["поменял масло в двигателе"])], TODAY);
  const oil = get(items, "oil-engine");
  check("масло, сделанное раньше срока → в порядке", oil.status === "ok", oil.status);
  check("срок от фактической замены (01.05.2027)", oil.dueDate === "2027-05-01", String(oil.dueDate));
  check("срок по пробегу 217 000", oil.dueKm === 217_000, String(oil.dueKm));
}

// 2. Просрочка по времени и по пробегу.
{
  const { items } = computePlan([...base, rec("2025-06-01", 190_000, ["Замена моторного масла"])], TODAY);
  check("масло старше 12 мес. → просрочено", get(items, "oil-engine").status === "overdue", get(items, "oil-engine").status);
}

// 3. «Скоро»: ≤ 30 дней до срока.
{
  const { items } = computePlan([...base, rec("2025-11-10", 201_000, ["Замена масла в двигателе"])], TODAY);
  check("до срока 18 дней → скоро", get(items, "oil-engine").status === "soon", `${get(items, "oil-engine").status} ${get(items, "oil-engine").daysLeft}`);
}

// 4. Масло АКПП не принимается за моторное, моторное — за АКПП; радиатор масла и теплообменник — не замена масла.
{
  const { items } = computePlan(
    [rec("2026-03-01", 201_000, ["Замена масла АКПП (частичная)"]), rec("2026-04-01", 201_500, ["Замена радиатора моторного масла (теплообменника)"])],
    TODAY
  );
  check("масло АКПП найдено", get(items, "oil-gearbox").basis?.date === "2026-03-01");
  check("масло двигателя НЕ найдено по АКПП/радиатору", get(items, "oil-engine").status === "no_data", String(get(items, "oil-engine").basis?.work));
}

// 5. Нет записей → «нет данных», а не «просрочено».
{
  const { items } = computePlan(base, TODAY);
  check("нет записи о замене → нет данных", get(items, "brake-fluid").status === "no_data");
}

// 6. Расплывчатое «масло и фильтры» считается как вероятная замена фильтров.
{
  const { items } = computePlan([rec("2026-02-01", 201_000, ["Замена моторного масла и фильтров"])], TODAY);
  check("«масло и фильтры» → фильтр, пометка loose", get(items, "air-filter").basis?.loose === true);
}

// 7. Пробег: показание сегодня — факт; старое показание — оценка от него.
{
  const exact = currentMileage(base, TODAY, { date: TODAY, km: 210_000 });
  check("показание сегодня → точное", exact.km === 210_000 && exact.estimated === false);
  const old = currentMileage(base, TODAY, { date: "2026-10-03", km: 210_000 });
  check("показание 20 дней назад → оценка +темп", old.estimated === true && (old.km ?? 0) > 210_000, String(old.km));
}

// 8. Кого пинговать.
{
  const { items } = computePlan([...base, rec("2025-06-01", 190_000, ["Замена моторного масла"])], TODAY); // oil overdue
  const oilOverdue = (log: ReminderLogRow[]) => pickReminders(items, log, TODAY).some((r) => r.item.id === "oil-engine");
  const row = (patch: Partial<ReminderLogRow>): ReminderLogRow => ({ item_id: "oil-engine", last_status: "overdue", notified_at: `${TODAY}T06:00:00Z`, snoozed_until: null, ...patch });

  check("впервые → пингуем", oilOverdue([]));
  check("пинговали сегодня → молчим (повторный запуск крона)", !oilOverdue([row({})]));
  check("пинговали 31 день назад → повтор", oilOverdue([row({ notified_at: "2026-09-22T06:00:00Z" })]));
  check("пинговали 10 дней назад → молчим", !oilOverdue([row({ notified_at: "2026-10-13T06:00:00Z" })]));
  check("«скоро» → «просрочено» → пингуем снова", oilOverdue([row({ last_status: "soon", notified_at: "2026-10-20T06:00:00Z" })]));
  check("отложено до завтра → молчим", !oilOverdue([row({ notified_at: "2026-09-01T06:00:00Z", snoozed_until: "2026-10-24" })]));
  check("отсрочка истекла вчера → пингуем", oilOverdue([row({ notified_at: "2026-09-01T06:00:00Z", snoozed_until: "2026-10-22" })]));

  const none = pickReminders(computePlan(base, TODAY).items, [], TODAY);
  check("«нет данных» и «в порядке» не пингуются никогда", none.length === 0, none.map((r) => r.item.id).join(","));
}

// 9. Пробег числом.
{
  check("«206500»", parseOdometer("206500") === 206_500);
  check("«пробег 206 500 км»", parseOdometer("пробег 206 500 км") === 206_500);
  check("«206500 км»", parseOdometer("206500 км") === 206_500);
  check("вопрос не пробег", parseOdometer("поменял масло 198500") === null);
  check("сумма из 4 цифр не пробег", parseOdometer("3200") === null);
  check("дата не пробег", parseOdometer("12.10.2026") === null);
  check("пробег больше 1,5 млн отвергается", parseOdometer("9999999") === null);
}

console.log(failed ? `\nПровалено: ${failed}` : "\nВсе проверки пройдены");
process.exit(failed ? 1 : 0);
