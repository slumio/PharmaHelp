import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { STORE_ID } from "@/lib/queries";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BillItem = z.object({
  name: z.string(),
  packSize: z.string().default("strip"),
  batchNo: z.string().default("NA"),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
  qty: z.number().int().min(0),
  mrp: z.number().min(0),
  purchasePrice: z.number().min(0).default(0),
});

const BillExtraction = z.object({
  supplierName: z.string().default("Unknown supplier"),
  items: z.array(BillItem),
});

export type BillExtraction = z.infer<typeof BillExtraction>;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const text = form.get("text"); // pasted CSV text alternative
  try {
    if (file instanceof File && file.type.startsWith("image/")) {
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: { code: "no_vision_model", message: "Set OPENAI_API_KEY to parse bill images" } }, { status: 400 });
      }
      const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      const { object } = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: BillExtraction,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Extract every line item from this pharmacy supplier bill image. Dates as YYYY-MM-DD." },
            { type: "image", image: `data:${file.type};base64,${b64}` },
          ],
        }],
      });
      return Response.json({ supplierName: object.supplierName, items: object.items, source: "image" });
    }

    // CSV text path (uploaded file or pasted): name,pack,batch,expiry,qty,mrp
    const csv = typeof text === "string" ? text : file instanceof File ? await file.text() : "";
    const items: z.infer<typeof BillItem>[] = [];
    for (const line of csv.split(/\r?\n/).filter(Boolean).slice(file ? 1 : 0)) {
      const [name, pack, batch, expiry, qty, mrp, purchase] = line.split(",").map((s) => s.trim());
      if (!name) continue;
      items.push({
        name, packSize: pack || "strip", batchNo: batch || "NA", expiryDate: /^\d{4}-\d{2}-\d{2}$/.test(expiry ?? "") ? expiry : "",
        qty: Number(qty) || 0, mrp: Number(mrp) || 0, purchasePrice: Number(purchase) || (Number(mrp) || 0) * 0.75,
      });
    }
    if (!items.length) return NextResponse.json({ error: { code: "empty", message: "No rows found. Expected: name,pack,batch,expiry,qty,mrp[,purchase]" } }, { status: 400 });
    return Response.json({ supplierName: "CSV import", items, source: "csv" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: { code: "parse_failed", message: "Could not extract bill items" } }, { status: 500 });
  }
}

// Confirm: takes the reviewed items and writes the purchase bill + stock movements.
const Confirm = z.object({
  supplierName: z.string().default("Unknown supplier"),
  sourceImageUrl: z.string().optional(),
  idempotencyKey: z.string().optional(),
  items: z.array(BillItem.extend({ rawRow: z.record(z.unknown()).optional() })).min(1),
});

export async function PUT(req: NextRequest) {
  const parsed = Confirm.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "validation", message: "items required" } }, { status: 400 });
  }
  const a = parsed.data;
  const subtotal = a.items.reduce((s, i) => s + i.qty * (i.purchasePrice || i.mrp * 0.75), 0);
  const gst = subtotal * 0.12;
  const bill = await db.execute<{ id: number }>(sql`
    INSERT INTO bills (store_id, kind, status, supplier_name, subtotal, gst_total, total, source_image_url, idempotency_key)
    VALUES (${STORE_ID}, 'purchase', 'confirmed', ${a.supplierName}, ${subtotal.toFixed(2)}, ${gst.toFixed(2)}, ${(subtotal + gst).toFixed(2)}, ${a.sourceImageUrl ?? null}, ${a.idempotencyKey ?? 'bill-' + Date.now()})
    ${a.idempotencyKey ? sql`ON CONFLICT (store_id, idempotency_key) DO NOTHING RETURNING id` : sql`RETURNING id`}
    `);
  const billId = bill[0]?.id;  if (!billId) return NextResponse.json({ error: { code: "duplicate", message: "Bill already processed" } }, { status: 409 });

  let inserted = 0;
  for (const it of a.items) {
    const rows = await db.execute<{ id: number }>(sql`
      INSERT INTO medicines (store_id, name, pack_size, batch_no, expiry_date, mrp, purchase_price)
      VALUES (${STORE_ID}, ${it.name}, ${it.packSize}, ${it.batchNo}, ${it.expiryDate || null}, ${it.mrp}, ${it.purchasePrice || it.mrp * 0.75})
      ON CONFLICT (store_id, name, pack_size, batch_no) DO UPDATE SET mrp = EXCLUDED.mrp
      RETURNING id`);
    await db.execute(sql`
      INSERT INTO stock_movements (store_id, medicine_id, kind, qty, reason, ref_type, ref_id)
      VALUES (${STORE_ID}, ${rows[0].id}, 'purchase', ${it.qty}, ${a.supplierName}, 'bill', ${billId})`);
    await db.execute(sql`
      INSERT INTO bill_items (bill_id, medicine_id, name_snapshot, pack_size, batch_no, expiry_date, qty, mrp, line_total, raw_row)
      VALUES (${billId}, ${rows[0].id}, ${it.name}, ${it.packSize}, ${it.batchNo}, ${it.expiryDate || null}, ${it.qty}, ${it.mrp},
              ${((it.qty) * (it.purchasePrice || it.mrp * 0.75)).toFixed(2)}, ${JSON.stringify(it.rawRow ?? it)}::jsonb)`);
    inserted += it.qty;
  }
  return Response.json({ billId, items: a.items.length, unitsAdded: inserted, total: +(subtotal + gst).toFixed(2) });
}
