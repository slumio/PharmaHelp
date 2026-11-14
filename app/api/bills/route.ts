import Papa from "papaparse";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmBill, ToolError } from "@/lib/repository";
import { randomUUID } from "node:crypto";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BillItem = z.object({
  name: z.string().trim().min(1).max(200),
  packSize: z.string().default("strip"),
  batchNo: z.string().default("NA"),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
  qty: z.number().int().min(1),
  mrp: z.number().min(0),
  purchasePrice: z.number().min(0).default(0),
});

const BillExtraction = z.object({
  supplierName: z.string().default("Unknown supplier"),
  items: z.array(BillItem).max(1000),
});

export type BillExtraction = z.infer<typeof BillExtraction>;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (file instanceof File && file.size > 8 * 1024 * 1024) return NextResponse.json({ error: { code: "too_large", message: "Maximum upload size is 8 MB" } }, { status: 413 });
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
    const parsedCsv = Papa.parse<string[]>(csv, { skipEmptyLines: "greedy" });
    if (parsedCsv.errors.length) return NextResponse.json({ error: { code: "validation", message: "Invalid CSV" } }, { status: 400 });
    const rows = parsedCsv.data;
    const hasHeader = /^(name|medicine)$/i.test(rows[0]?.[0]?.trim() ?? "");
    for (const row of rows.slice(hasHeader ? 1 : 0)) {
      const [name, pack, batch, expiry, qty, mrp, purchase] = row.map(value => value.trim());
      const item = BillItem.safeParse({ name, packSize: pack || "strip", batchNo: batch || "NA", expiryDate: expiry || "", qty: Number(qty), mrp: Number(mrp), purchasePrice: purchase ? Number(purchase) : Number(mrp) * 0.75 });
      if (!item.success || items.length >= 1000) return NextResponse.json({ error: { code: "validation", message: "Invalid CSV row or more than 1000 items" } }, { status: 400 });
      items.push(item.data);
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
  items: z.array(BillItem.extend({ rawRow: z.record(z.string(), z.unknown()).optional() } )).min(1).max(1000),
});

export async function PUT(req: NextRequest) {
  const parsed = Confirm.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "validation", message: "items required" } }, { status: 400 });
  }
  const a = parsed.data;
  try {
    return Response.json(await confirmBill({ supplierName: a.supplierName, idempotencyKey: a.idempotencyKey ?? randomUUID(), items: a.items.map(item => ({ ...item, expiryDate: item.expiryDate || undefined })) }));
  } catch (error) {
    if (error instanceof ToolError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 409 });
    console.error("Bill confirmation failed", error);
    return NextResponse.json({ error: { code: "internal", message: "Bill could not be saved" } }, { status: 500 });
  }
}
