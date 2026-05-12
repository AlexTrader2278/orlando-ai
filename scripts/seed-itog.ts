/**
 * Полная история обслуживания Chevrolet Orlando, объединённая из двух источников:
 *   - data/my-car.json     (свежие записи 2023 + конец 2025)
 *   - data/itog.txt        (полная история 2013–2025)
 *
 * Скрипт:
 *  1) удаляет старые seed/summary записи (manual записи пользователя НЕ трогает)
 *  2) заливает объединённый список (20 записей) как source='seed'
 *
 * Запуск:  npm run seed-itog
 */
import { httpDelete, httpPost } from "../lib/http";

function sbUrl(p: string): string {
  const base = process.env.SUPABASE_URL;
  if (!base) throw new Error("SUPABASE_URL is not set");
  return `${base}${p}`;
}
function sbAuth(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return { apikey: key, Authorization: `Bearer ${key}` };
}

type Rec = {
  date: string;
  mileage_km: number | null;
  works: string[];
  materials: string[];
  cost_works?: number | null;
  cost_materials?: number | null;
  cost_total?: number | null;
  notes?: string | null;
};

const RECORDS: Rec[] = [
  // ─── 2025 ──────────────────────────────────────────────────────────────
  {
    date: "2025-12-19",
    mileage_km: 196950,
    works: [
      "Очистка электромагнитных клапанов системы изменения фаз газораспределения (VVT)",
      "Удаление разрушенных фильтрующих сеток клапанов VVT",
    ],
    materials: [],
  },
  {
    date: "2025-11-25",
    mileage_km: 196800,
    works: ["Замена теплообменника в сборе (исключение смешивания масла и охлаждающей жидкости)"],
    materials: [],
  },
  {
    date: "2025-10-12",
    mileage_km: 196300,
    works: [
      "Сброс адаптаций АКПП",
      "Промывка соленоидов АКПП с использованием диагностического оборудования",
      "Адаптация АКПП",
    ],
    materials: [],
  },
  {
    date: "2025-10-03",
    mileage_km: 196200,
    works: ["Частичная замена трансмиссионной жидкости АКПП"],
    materials: ["Трансмиссионная жидкость АКПП Лукойл, 4 л"],
  },
  {
    date: "2025-09-21",
    mileage_km: 195900,
    works: ["Замена масла АКПП (частичная)"],
    materials: ["Масло трансмиссионное Shell Spirax S6 ATF X, 5 л"],
  },
  {
    date: "2025-05-16",
    mileage_km: 195300,
    works: [
      "Замена сальника распределительного вала",
      "Замена ремня привода ГРМ",
      "Замена обводного ролика приводного ремня",
      "Замена свечей зажигания",
    ],
    materials: [
      "Прокладка клапанной крышки (Chevrolet Cruze)",
      "Сальник распределительного вала GM",
      "Сальник коленвала передний GM",
      "Ремень ГРМ (Chevrolet Aveo)",
      "Заглушка болта фазорегулятора GM",
      "Свечи зажигания GM Denso",
      "Обводной ролик приводного ремня GMB",
    ],
  },

  // ─── 2023 ──────────────────────────────────────────────────────────────
  {
    date: "2023-06-12",
    mileage_km: 173517,
    works: [
      "Диагностика системы охлаждения",
      "Замена термостата",
      "Замена корпуса термостата в сборе",
      "Замена водяного насоса (помпы)",
      "Промывка инжекторных систем",
      "Чистка трубок системы охлаждения",
      "Ремонт приводного ремня",
    ],
    materials: [
      "Жидкость WOG для промывки инжектора, 800 мл",
      "Насос водяной Miles (Opel/Chevrolet)",
      "Уплотнительные кольца",
      "Корпус термостата в сборе",
    ],
    cost_works: 7020,
    cost_materials: 20419,
    cost_total: 27439,
  },

  // ─── 2020 (дата приблизительная) ───────────────────────────────────────
  {
    date: "2020-07-01",
    mileage_km: 150000,
    works: ["Замена масла в АКПП", "Замена фильтра АКПП"],
    materials: [],
    notes: "Дата приблизительная (июль 2020).",
  },

  // ─── 2019 ──────────────────────────────────────────────────────────────
  {
    date: "2019-05-18",
    mileage_km: 120256,
    works: [
      "ТО-08",
      "Замена моторного масла и фильтров",
      "Замена комплекта ремня ГРМ",
      "Замена роликов ГРМ",
      "Замена заглушки болта фазорегулятора",
      "Замена ламп фар (со снятием)",
    ],
    materials: [],
  },

  // ─── 2018 ──────────────────────────────────────────────────────────────
  {
    date: "2018-05-20",
    mileage_km: 104491,
    works: ["ТО-07", "Замена моторного масла и фильтров"],
    materials: [],
  },
  {
    date: "2018-04-26",
    mileage_km: 101502,
    works: [
      "Замена радиатора моторного масла (теплообменника)",
      "Снятие/установка защиты картера двигателя",
    ],
    materials: [],
  },
  {
    date: "2018-02-18",
    mileage_km: null,
    works: [
      "Замена сальника привода правой стороны",
      "Замена масла в АКПП",
      "Замена сальника вала АКПП",
    ],
    materials: ["Масло Dextron VI, 1 л", "Очиститель тормозных дисков"],
  },

  // ─── 2017 ──────────────────────────────────────────────────────────────
  {
    date: "2017-10-13",
    mileage_km: 92806,
    works: ["Замена подогрева сиденья (переднее левое)"],
    materials: [],
  },
  {
    date: "2017-09-22",
    mileage_km: 92321,
    works: [
      "Развал-схождение (передняя и задняя оси)",
      "Замена сальников АКПП",
    ],
    materials: [
      "Сальник коленвала задний",
      "Сальник АКПП",
      "Очиститель карбюратора, спрей 500 мл",
      "Масло Dextron VI, 1 л",
    ],
  },
  {
    date: "2017-07-28",
    mileage_km: null,
    works: ["ТО-06", "Замена тормозной жидкости", "Снятие/установка защиты"],
    materials: [
      "Комплект масла и фильтров для ТО",
      "Набор смазок для ТО",
      "Тормозная жидкость G-Energy Expert DOT 4, 0.45 л",
    ],
  },

  // ─── 2016 ──────────────────────────────────────────────────────────────
  {
    date: "2016-08-23",
    mileage_km: 75052,
    works: [
      "ТО 75 000 км",
      "Замена моторного масла",
      "Замена масла АКПП",
      "Чистка топливных форсунок",
    ],
    materials: [
      "Масло GM 5W-30 Dexos2",
      "Фильтр масляный (элемент)",
      "Прокладка сливной пробки картера",
      "Свечи зажигания",
      "Промывка инжектора LAVR ML 101",
      "Фильтр салонный AMD",
      "Масло Dextron VI, 1 л",
    ],
  },

  // ─── 2015 ──────────────────────────────────────────────────────────────
  {
    date: "2015-10-23",
    mileage_km: null,
    works: ["Замена моторного масла", "Замена тормозной жидкости"],
    materials: [
      "Масло GM 5W-30 Dexos-2",
      "Фильтр масляный (элемент)",
      "Кольцо уплотнительное",
      "Тормозная жидкость Shell Brake DOT4 ESL, 0.5 л",
    ],
  },
  {
    date: "2015-08-24",
    mileage_km: 57856,
    works: ["Замена масла АКПП"],
    materials: ["Масло Dextron VI, 1 л"],
  },

  // ─── 2013 ──────────────────────────────────────────────────────────────
  {
    date: "2013-10-19",
    mileage_km: null,
    works: ["ТО-15000", "Замена моторного масла"],
    materials: [
      "Масло GM 5W-30 Dexos-2",
      "Фильтр масляный (элемент)",
      "Смазка Castrol LMX Li-Komplexfett (литол), 0.3 кг",
    ],
  },
  {
    date: "2013-05-14",
    mileage_km: 7,
    works: ["Установка брызговиков (передних и задних)"],
    materials: [
      "Брызговики передние Chevrolet Orlando",
      "Брызговики задние Chevrolet Orlando",
    ],
    notes: "Начальный пробег — машина практически новая.",
  },
];

async function main() {
  console.log(`Готовлю ${RECORDS.length} записей для seed.\n`);

  // 1) Сносим старые seed/summary, manual оставляем
  console.log("Удаляю старые seed/summary записи (manual записи не трогаю)…");
  const del = await httpDelete(
    sbUrl("/rest/v1/service_records?source=in.(seed,summary)"),
    { ...sbAuth(), Prefer: "return=minimal" },
    20_000
  );
  if (del.status >= 400) {
    throw new Error(`DELETE failed: ${del.status} ${del.body.slice(0, 300)}`);
  }
  console.log("  ✓ удалено\n");

  // 2) Заливаем новый набор
  console.log("Загружаю новый seed…\n");
  let ok = 0;
  for (const r of RECORDS) {
    const payload = {
      date: r.date,
      mileage_km: r.mileage_km,
      works: r.works,
      materials: r.materials,
      parts: [],
      cost_works: r.cost_works ?? null,
      cost_materials: r.cost_materials ?? null,
      cost_total: r.cost_total ?? null,
      notes: r.notes ?? null,
      source: "seed",
    };
    const ins = await httpPost(
      sbUrl("/rest/v1/service_records"),
      payload,
      { ...sbAuth(), Prefer: "return=minimal" },
      15_000
    );
    if (ins.status >= 400) {
      console.error(`  ✗ ${r.date} → ${ins.status}: ${ins.body.slice(0, 200)}`);
      continue;
    }
    ok++;
    const mileage = r.mileage_km != null ? `${r.mileage_km.toLocaleString("ru-RU")} км` : "—";
    const first = (r.works[0] ?? "?").slice(0, 70);
    console.log(`  ✓ ${r.date} | ${mileage} | ${first}`);
  }

  console.log(`\nГотово. Залито ${ok}/${RECORDS.length} записей.`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
