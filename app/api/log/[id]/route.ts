import { NextResponse } from "next/server";
import { deleteServiceRecord, updateServiceRecord } from "@/lib/car";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAuth(req: Request): { ok: boolean; reason?: string } {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return { ok: false, reason: "ADMIN_KEY is not configured on server" };
  const got = req.headers.get("x-admin-key");
  if (!got) return { ok: false, reason: "PIN required" };
  if (got !== expected) return { ok: false, reason: "Invalid PIN" };
  return { ok: true };
}

type AllowedPatch = {
  date?: string;
  mileage_km?: number | null;
  works?: string[];
  materials?: string[];
  parts?: unknown[];
  cost_works?: number | null;
  cost_materials?: number | null;
  cost_total?: number | null;
  notes?: string | null;
};

// Только эти поля разрешены к обновлению из UI.
const ALLOWED_FIELDS = new Set<keyof AllowedPatch>([
  "date",
  "mileage_km",
  "works",
  "materials",
  "parts",
  "cost_works",
  "cost_materials",
  "cost_total",
  "notes",
]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = checkAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

    const body = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED_FIELDS.has(key as keyof AllowedPatch)) {
        patch[key] = body[key];
      }
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    const updated = await updateServiceRecord(params.id, patch);
    return NextResponse.json({ ok: true, record: updated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = checkAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

    await deleteServiceRecord(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
