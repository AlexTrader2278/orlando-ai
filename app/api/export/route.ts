import { NextResponse } from "next/server";
import { getServiceRecords } from "@/lib/car";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") ?? "json").toLowerCase();
    const records = await getServiceRecords(1000);
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "csv") {
      const header = [
        "Дата",
        "Пробег, км",
        "Работы",
        "Материалы",
        "Запчасти",
        "Стоимость работ",
        "Стоимость материалов",
        "Итого",
        "Заметки",
        "Источник",
      ];
      const rows = records.map((r) => [
        r.date,
        r.mileage_km ?? "",
        r.works.join(" | "),
        r.materials.join(" | "),
        (r.parts ?? [])
          .map((p) =>
            [p.brand, p.name, p.article, p.qty, p.unit, p.price].filter(Boolean).join(" ")
          )
          .join(" | "),
        r.cost_works ?? "",
        r.cost_materials ?? "",
        r.cost_total ?? "",
        r.notes ?? "",
        r.source ?? "",
      ]);
      // BOM, чтобы Excel на Windows правильно открыл кириллицу
      const csv =
        "﻿" +
        [header, ...rows].map((line) => line.map(csvCell).join(";")).join("\r\n");

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="orlando-service-${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // JSON — полный бэкап
    const json = JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        vehicle: "Chevrolet Orlando, VIN KL1YA755JCK767286",
        count: records.length,
        records,
      },
      null,
      2
    );

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="orlando-service-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
