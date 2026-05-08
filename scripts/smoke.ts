import { smokeCount } from "../lib/supabase-rest";

async function main() {
  const n = await smokeCount();
  console.log(`OK: threads table reachable. Sample: ${n} rows.`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
