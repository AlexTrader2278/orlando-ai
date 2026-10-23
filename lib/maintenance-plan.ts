import type { ServiceRecord } from "./car";

/** Откуда взята цифра интервала. «завод» — только если есть документ завода именно на эту машину. */
export type IntervalSource = "завод" | "сервисы" | "форум" | "по вашей истории";

export type PlanItem = {
  id: string;
  title: string;
  /** Короткое имя для кнопок Telegram (≤ ~18 символов). */
  short: string;
  intervalKm: number | null;
  intervalMonths: number | null;
  source: IntervalSource;
  /** Пояснение для владельца: откуда цифра и где источники расходятся. */
  note: string;
  /** Запись «сделано», если работа (отдельная строка works) совпала с одним из шаблонов и не совпала с exclude. */
  works: RegExp[];
  /** Шаблоны по материалам (когда в works нет, но в материалах есть явный признак). */
  materials?: RegExp[];
  /** Расплывчатые формулировки («замена масла и фильтров»): считаем, но говорим «вероятно». */
  loose?: RegExp[];
  exclude?: RegExp;
};

// ВАЖНО: в JS \w не знает кириллицу, поэтому в шаблонах — явный класс [а-яёa-z0-9]. Глаголы: «замена», «поменял», «менял».
const NOT_GEARBOX = /акпп|кпп|трансмисс|atf|dextron/i;

/**
 * Регламент. Цифры — ориентиры из открытых источников (план plans/maintenance-reminders.md, раздел «Источники»),
 * не документ завода. Слово «официальный» в сообщениях бота запрещено, пока source !== "завод".
 */
export const PLAN: PlanItem[] = [
  {
    id: "oil-engine",
    short: "Масло двигателя",
    title: "Масло двигателя и масляный фильтр",
    intervalKm: 15_000,
    intervalMonths: 12,
    source: "сервисы",
    note: "15 000 км / 12 мес. по регламентам сервисов (auto.ru — для Orlando II); на вашей машине ТО шли каждые ~15 тыс.",
    works: [/(?:замен|поменя|менял|смен)[а-яёa-z0-9]*\s+(моторн[а-яёa-z0-9]+\s+)?масл/i, /(?:^|[^а-яё])то[-\s]?\d+/i],
    materials: [/комплект масла и фильтров/i],
    exclude: new RegExp(`${NOT_GEARBOX.source}|радиатор|теплообмен`, "i"),
  },
  {
    id: "oil-gearbox",
    short: "Масло АКПП",
    title: "Масло АКПП",
    intervalKm: 60_000,
    intervalMonths: 48,
    source: "форум",
    note: "Официального интервала для 6T40 нет (60 тыс. — со слов владельцев и сервисов, до 150 тыс. по другим). По вашей истории меняли через ~46–50 тыс. км.",
    works: [/(?:замен|поменя|менял|смен)[а-яёa-z0-9]*\s+([а-яёa-z0-9]+\s+)?(масл[а-яёa-z0-9]*|трансмиссионн[а-яёa-z0-9]+\s+жидкост[а-яёa-z0-9]*)\s+(в\s+)?акпп/i, /(?:замен|поменя|менял|смен)[а-яёa-z0-9]*\s+масл[а-яёa-z0-9]*\s+(в\s+)?акпп/i, /частичн[а-яёa-z0-9]+\s+(?:замен|поменя|менял|смен)[а-яёa-z0-9]*\s+трансмиссионн/i],
  },
  {
    id: "brake-fluid",
    short: "Тормозная жидк.",
    title: "Тормозная жидкость",
    intervalKm: 30_000,
    intervalMonths: 24,
    source: "сервисы",
    note: "30 000 км / 24 мес. (to-club и auto.ru сходятся). Критично для безопасности.",
    works: [/(?:замен|поменя|менял|смен)[а-яёa-z0-9]*\s+тормозн[а-яёa-z0-9]+\s+жидкост/i],
  },
  {
    id: "timing-belt",
    short: "Ремень ГРМ",
    title: "Ремень ГРМ (+ ролики, помпа)",
    intervalKm: 90_000,
    intervalMonths: 72,
    source: "сервисы",
    note: "Источники расходятся: 90 тыс./6 лет (auto.ru, Orlando II) и 150 тыс./10 лет (to-club). По вашей истории меняли через ~75 тыс. Беру ранний — обрыв ремня дорогой.",
    works: [/(?:замен|поменя|менял|смен)[а-яёa-z0-9]*\s+(комплект[а-яёa-z0-9]*\s+)?ремн[а-яёa-z0-9]+\s+(привода\s+)?грм/i, /(?:замен|поменя|менял|смен)[а-яёa-z0-9]*\s+ремн[а-яёa-z0-9]+\s+грм/i],
  },
  {
    id: "spark-plugs",
    short: "Свечи",
    title: "Свечи зажигания",
    intervalKm: 60_000,
    intervalMonths: 48,
    source: "сервисы",
    note: "to-club: 60 тыс./4 года; auto.ru (Orlando II): 30 тыс./2 года. Беру 60 тыс. — вы реально меняли реже.",
    works: [/(?:замен|поменя|менял|смен)[а-яёa-z0-9]*\s+свеч/i],
    materials: [/свеч[а-яёa-z0-9]+\s+зажиган/i],
  },
  {
    id: "air-filter",
    short: "Воздушный фильтр",
    title: "Воздушный фильтр",
    intervalKm: 60_000,
    intervalMonths: 48,
    source: "сервисы",
    note: "60 тыс. / 4 года (to-club).",
    works: [/(?:замен|поменя|менял|смен)[а-яёa-z0-9]*\s+воздушн[а-яёa-z0-9]+\s+фильтр/i],
    loose: [/(?:замен|поменя|менял|смен)[а-яёa-z0-9]*\s+(моторн[а-яёa-z0-9]+\s+)?масл[а-яёa-z0-9]+\s+и\s+фильтр/i],
  },
  {
    id: "cabin-filter",
    short: "Салонный фильтр",
    title: "Салонный фильтр",
    intervalKm: 30_000,
    intervalMonths: 24,
    source: "сервисы",
    note: "to-club: на ТО-2 (30 тыс.) и далее раз в 2 года.",
    works: [/(?:замен|поменя|менял|смен)[а-яёa-z0-9]*\s+салонн[а-яёa-z0-9]+\s+фильтр/i],
    materials: [/фильтр\s+салонн/i, /салонн[а-яёa-z0-9]+\s+фильтр/i],
    loose: [/(?:замен|поменя|менял|смен)[а-яёa-z0-9]*\s+(моторн[а-яёa-z0-9]+\s+)?масл[а-яёa-z0-9]+\s+и\s+фильтр/i],
  },
  {
    id: "accessory-belt",
    short: "Привод. ремень",
    title: "Приводной ремень (генератор, помпа)",
    intervalKm: 90_000,
    intervalMonths: 120,
    source: "сервисы",
    note: "90 тыс. / 10 лет (to-club); auto.ru — вместе с ГРМ на 90 тыс.",
    works: [/(?:замен|поменя|менял|смен)[а-яёa-z0-9]*\s+([а-яёa-z0-9]+\s+)?приводн[а-яёa-z0-9]+\s+ремн/i],
    exclude: /ролик/i,
  },
  {
    id: "coolant",
    short: "Антифриз",
    title: "Охлаждающая жидкость (антифриз)",
    intervalKm: 240_000,
    intervalMonths: 60,
    source: "сервисы",
    note: "to-club: 240 тыс. / 5 лет. В регламенте auto.ru строки про антифриз нет — срок мягкий.",
    works: [/(?:замен|поменя|менял|смен)[а-яёa-z0-9]*\s+(охлаждающ[а-яёa-z0-9]+\s+жидкост|антифриз)/i],
  },
];

/* ── Расчёт ── */

export type OdometerReading = { date: string; km: number };

export type CurrentMileage = {
  km: number | null;
  /** true — оценка по темпу; false — точное значение (последняя запись или введённый владельцем). */
  estimated: boolean;
  asOf: string | null;
  /** км/сутки, по которым считали оценку. */
  pacePerDay: number | null;
};

export type ItemStatus = "ok" | "soon" | "overdue" | "no_data";

export type ItemResult = {
  item: PlanItem;
  status: ItemStatus;
  /** Запись, на которую опирается расчёт — чтобы владелец мог проверить глазами. */
  basis: { date: string; mileage_km: number | null; work: string; loose: boolean } | null;
  dueDate: string | null;
  dueKm: number | null;
  daysLeft: number | null;
  kmLeft: number | null;
  /** Меньшее из «дней до срока» и «пробега до срока, пересчитанного в дни по вашему темпу». */
  effDaysLeft: number | null;
  /** Осталось меньше месяца — повод для второго, «последнего» предупреждения. */
  urgent: boolean;
};

const DAY = 86_400_000;
/** Первое предупреждение «пора планировать» за ~2 месяца, второе «последний звонок» — за ~месяц. */
export const SOON_DAYS = 60;
export const URGENT_DAYS = 30;
/** Темп для пересчёта км в дни, если оценить его по записям не удалось (~11 тыс. км/год). */
const DEFAULT_PACE = 30;

function toTime(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getTime();
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toTime(toIso) - toTime(fromIso)) / DAY);
}

/** Среднесуточный пробег по записям с пробегом за ~3 года до последней записи. */
export function estimatePace(records: ServiceRecord[]): number | null {
  const pts = records
    .filter((r) => r.mileage_km != null && r.mileage_km > 0)
    .map((r) => ({ t: toTime(r.date), km: r.mileage_km as number }))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const recent = pts.filter((p) => last.t - p.t <= 1100 * DAY);
  const first = recent.length >= 2 ? recent[0] : pts[0];
  const days = (last.t - first.t) / DAY;
  if (days < 60 || last.km <= first.km) return null;
  return (last.km - first.km) / days;
}

export function currentMileage(
  records: ServiceRecord[],
  today: string,
  odometer: OdometerReading | null = null
): CurrentMileage {
  const pace = estimatePace(records);
  // Опора — самое свежее значение пробега: запись книжки или показание, введённое владельцем.
  const points: { date: string; km: number }[] = records
    .filter((r) => r.mileage_km != null && r.mileage_km > 0)
    .map((r) => ({ date: r.date, km: r.mileage_km as number }));
  if (odometer) points.push({ date: odometer.date, km: odometer.km });
  points.sort((a, b) => (a.date === b.date ? b.km - a.km : a.date < b.date ? 1 : -1));
  const base = points[0] ?? null;
  if (!base) return { km: null, estimated: true, asOf: null, pacePerDay: pace };

  const days = Math.max(0, daysBetween(base.date, today));
  if (days === 0) return { km: base.km, estimated: false, asOf: base.date, pacePerDay: pace };
  if (pace == null) return { km: base.km, estimated: true, asOf: base.date, pacePerDay: pace };
  return { km: Math.round(base.km + pace * days), estimated: true, asOf: base.date, pacePerDay: pace };
}

function matchRecord(item: PlanItem, r: ServiceRecord): { work: string; loose: boolean } | null {
  for (const w of r.works ?? []) {
    if (item.exclude?.test(w)) continue;
    if (item.works.some((re) => re.test(w))) return { work: w, loose: false };
  }
  for (const m of r.materials ?? []) {
    if (item.materials?.some((re) => re.test(m))) return { work: `материал: ${m}`, loose: false };
  }
  for (const w of r.works ?? []) {
    if (item.loose?.some((re) => re.test(w))) return { work: w, loose: true };
  }
  return null;
}

export function computePlan(
  records: ServiceRecord[],
  today: string,
  odometer: OdometerReading | null = null
): { mileage: CurrentMileage; items: ItemResult[] } {
  const mileage = currentMileage(records, today, odometer);
  const sorted = [...records].sort((a, b) =>
    a.date === b.date ? (b.mileage_km ?? 0) - (a.mileage_km ?? 0) : a.date < b.date ? 1 : -1
  );

  const items: ItemResult[] = PLAN.map((item) => {
    let basis: ItemResult["basis"] = null;
    for (const r of sorted) {
      const m = matchRecord(item, r);
      if (m) {
        basis = { date: r.date, mileage_km: r.mileage_km, work: m.work, loose: m.loose };
        break;
      }
    }
    if (!basis) {
      return { item, status: "no_data", basis: null, dueDate: null, dueKm: null, daysLeft: null, kmLeft: null, effDaysLeft: null, urgent: false };
    }

    const dueDate = item.intervalMonths != null ? addMonths(basis.date, item.intervalMonths) : null;
    const dueKm =
      item.intervalKm != null && basis.mileage_km != null ? basis.mileage_km + item.intervalKm : null;
    const daysLeft = dueDate ? daysBetween(today, dueDate) : null;
    const kmLeft = dueKm != null && mileage.km != null ? dueKm - mileage.km : null;

    const pace = mileage.pacePerDay ?? DEFAULT_PACE;
    const horizons = [daysLeft, kmLeft != null ? kmLeft / pace : null].filter((n): n is number => n != null);
    const effDaysLeft = horizons.length ? Math.round(Math.min(...horizons)) : null;

    let status: ItemStatus = "ok";
    if ((daysLeft != null && daysLeft < 0) || (kmLeft != null && kmLeft < 0)) status = "overdue";
    else if (effDaysLeft != null && effDaysLeft <= SOON_DAYS) status = "soon";
    const urgent = status === "soon" && effDaysLeft != null && effDaysLeft <= URGENT_DAYS;

    return { item, status, basis, dueDate, dueKm, daysLeft, kmLeft, effDaysLeft, urgent };
  });

  return { mileage, items };
}

/* ── Напоминания: кого и когда пинговать ── */

export type ReminderLogRow = {
  item_id: string;
  last_status: ItemStatus;
  notified_at: string; // ISO timestamp
  snoozed_until: string | null; // YYYY-MM-DD
};

const RANK: Record<ItemStatus, number> = { no_data: 0, ok: 0, soon: 1, overdue: 2 };
export const OVERDUE_REPEAT_DAYS = 30;

/**
 * Пингуем пункт, если он «скоро» (≤ 60 дн.)/«просрочен» и: ещё не пинговали, ИЛИ стало хуже (скоро → просрочено),
 * ИЛИ «скоро» перешло в «меньше месяца» (второе предупреждение, один раз), ИЛИ просрочен и прошло ≥ 30 дней. Отложенное (snoozed_until ≥ сегодня) молчит.
 * «В порядке» и «нет записей» не пингуем никогда — «нет записей» видно в «План ТО» по запросу.
 */
export function pickReminders(items: ItemResult[], log: ReminderLogRow[], today: string): ItemResult[] {
  const byId = new Map(log.map((r) => [r.item_id, r]));
  return items.filter((r) => {
    if (r.status !== "soon" && r.status !== "overdue") return false;
    const row = byId.get(r.item.id);
    if (!row) return true;
    if (row.snoozed_until && row.snoozed_until >= today) return false;
    if (RANK[r.status] > RANK[row.last_status]) return true;
    const sinceNotified = daysBetween(row.notified_at.slice(0, 10), today);
    if (r.status === "overdue") return sinceNotified >= OVERDUE_REPEAT_DAYS;
    // Второе предупреждение за месяц: шлём один раз — если при прошлом напоминании до срока было ещё больше месяца.
    // (effDaysLeft + прошедшие дни ≈ значение на момент прошлого напоминания; после «последнего звонка» оно ≤ 30 и не повторяется.)
    return r.urgent && r.effDaysLeft != null && r.effDaysLeft + sinceNotified > URGENT_DAYS;
  });
}
