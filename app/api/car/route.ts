import { NextResponse } from "next/server";
import { getServiceRecords, buildSummary } from "@/lib/car";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const records = await getServiceRecords(50);
    return NextResponse.json({
      summary: buildSummary(records),
      records,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
