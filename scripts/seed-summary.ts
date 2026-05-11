/**
 * Заливает service_summary_2022_2025 как одну агрегированную запись
 * с source='summary', чтобы ИИ знал какие работы делались
 * в принципе (без точных дат).
 */
import { readFileSync } from "node:fs";
import { insertServiceRecord, getServiceRecords } from "../lib/car";

const PATH = process.env.SEED_JSON_PATH ?? "data/my-car.json";

type CarFile = {
  service_summary_2022_2025?: {
    maintenance?: Record<string, string[]>;
    transmission?: Record<string, { works?: string[] }>;
    engine?: { works?: string[] };
    chassis_and_other?: { works?: string[] };
  };
};

function collectWorks(summary: CarFile["service_summary_2022_2025"]): string[] {
  if (!summary) return [];
  const out: string[] = [];

  // maintenance: fluids / filters / seals_and_gaskets
  if (summary.maintenance) {
    for (const arr of Object.values(summary.maintenance)) {
      if (Array.isArray(arr)) out.push(...arr);
    }
  }

  // transmission.automatic_transmission.works / transmission.drives.works
  if (summary.transmission) {
    for (const sub of Object.values(summary.transmission)) {
      if (sub && Array.isArray(sub.works)) out.push(...sub.works);
    }
  }

  // engine.works
  if (summary.engine?.works) out.push(...summary.engine.works);

  // chassis_and_other.works
  if (summary.chassis_and_other?.works) out.push(...summary.chassis_and_other.works);

  // дедуп с сохранением порядка
  const seen = new Set<string>();
  return out.filter((w) => {
    if (seen.has(w)) return false;
    seen.add(w);
    return true;
  });
}

async function main() {
  console.log(`Reading ${PATH}…`);
  const raw = readFileSync(PATH, "utf-8");
  const json = JSON.parse(raw) as CarFile;
  const works = collectWorks(json.service_summary_2022_2025);
  console.log(`Found ${works.length} summary works`);

  // если уже есть summary-запись — не дублируем
  const all = await getServiceRecords(200);
  const existing = all.find((r) => r.source === "summary");
  if (existing) {
    console.log("Summary record already exists, skipping insert. ID:", existing.id);
    return;
  }

  const inserted = await insertServiceRecord({
    date: "2022-01-01",
    mileage_km: null,
    works,
    materials: [],
    cost_works: null,
    cost_materials: null,
    cost_total: null,
    notes: "Сводка работ за 2022–2025 без привязки к точным датам. Все эти операции были выполнены за период, но даты неизвестны.",
    source: "summary",
  });

  console.log("\n✓ Summary record inserted:", inserted.id);
  console.log(`  Date: ${inserted.date}, works: ${inserted.works.length}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
