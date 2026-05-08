import { getAdminClient } from "../lib/supabase.js";

async function main() {
  const sb = getAdminClient();
  const { count, error } = await sb
    .from("threads")
    .select("*", { count: "exact", head: true });
  if (error) {
    console.error("Supabase error:", error);
    process.exit(1);
  }
  console.log(`OK: threads table reachable, current rows: ${count ?? 0}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
