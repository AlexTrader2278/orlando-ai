/**
 * Заливает D:\Шевроле Орландо\JSON.txt (или путь из SEED_JSON_PATH)
 * в таблицу service_records.
 *
 * Запуск:
 *   npm run seed-car
 */
import { readFileSync } from "node:fs";
import { insertServiceRecord } from "../lib/car";

const PATH = process.env.SEED_JSON_PATH ?? "D:\\Шевроле Орландо\\JSON.txt";

type Entry = {
  date: string;
  mileage_km?: number;
  works?: string[];
  materials?: string[];
  cost?: { works?: number; materials?: number; total?: number };
};

type CarFile = {
  service_history?: Record<string, Entry[]>;
};

async function main() {
  console.log(`Reading ${PATH}…`);
  const raw = readFileSync(PATH, "utf-8");
  const json = JSON.parse(raw) as CarFile;

  const history = json.service_history ?? {};
  const entries: Entry[] = [];
  for (const year of Object.keys(history)) {
    for (const e of history[year]) entries.push(e);
  }
  entries.sort((a, b) => (a.date < b.date ? 1 : -1));

  console.log(`Found ${entries.length} service entries. Uploading…\n`);

  let ok = 0;
  for (const e of entries) {
    try {
      const inserted = await insertServiceRecord({
        date: e.date,
        mileage_km: e.mileage_km ?? null,
        works: e.works ?? [],
        materials: e.materials ?? [],
        cost_works: e.cost?.works ?? null,
        cost_materials: e.cost?.materials ?? null,
        cost_total: e.cost?.total ?? null,
        notes: null,
        source: "seed",
      });
      ok++;
      const mileage = inserted.mileage_km ? `${inserted.mileage_km.toLocaleString("ru-RU")} км` : "-";
      const first = (inserted.works[0] ?? "?").slice(0, 70);
      console.log(`  ✓ ${inserted.date} | ${mileage} | ${first}`);
    } catch (err) {
      console.error(`  ✗ ${e.date}: ${(err as Error).message}`);
    }
  }

  console.log(`\nDone. Inserted ${ok}/${entries.length} records.`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
