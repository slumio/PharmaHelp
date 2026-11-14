import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { STORE_ID, currentStock, dashboardMetrics } from "@/lib/queries";

// ---------------------------------------------------------------------------
// Single source of truth for agent tool contracts. The REST routes validate
// request bodies with these schemas; the LLM agent gets them as JSON Schema.
// Every numeric answer is computed in SQL here — never by the model.
// ---------------------------------------------------------------------------

export const SearchMedicines = z.object({
  query: z.string().min(1).describe("Medicine name (partial match allowed)"),
  limit: z.number().int().min(1).max(50).default(10),
});
export const FindRackLocation = z.object({ query: z.string().min(1) });
export const GetDashboardMetrics = z.object({});
export const GetExpiringStock = z.object({ days: z.number().int().min(1).max(365).default(90) });
export const GetLowStock = z.object({});

export const UpsertStock = z.object({
  name: z.string().min(1),
  packSize: z.string().default("strip"),
  batchNo: z.string().default("NA"),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mrp: z.number().min(0),
  purchasePrice: z.number().min(0).default(0),
  qty: z.number().int().min(1),
  rackCode: z.string().optional(),
  rowNo: z.number().int().min(0).optional(),
  colNo: z.number().int().min(0).optional(),
  supplierName: z.string().optional(),
  sourceImageUrl: z.string().optional(),
});

export const UpdateStockCount = z.object({
  medicineId: z.number().int(),
  countedQty: z.number().int().min(0),
  reason: z.string().default("physical count adjustment"),
});
export const ReduceStock = z.object({
  medicineId: z.number().int(),
  qty: z.number().int().min(1),
  reason: z.string().default("manual issue"),
});
export const DeleteStock = z.object({
  medicineId: z.number().int(),
  reason: z.string().default("removed from shelf"),
});

export const CreateOrder = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  paid: z.number().min(0).optional(),
  items: z.array(z.object({ medicineId: z.number().int(), qty: z.number().int().min(1) })).min(1),
});

export type ToolMap = {
  [name: string]: { schema: z.ZodTypeAny; run: (args: never) => Promise<unknown>; description: string };
};

async function stockOf(medicineId: number): Promise<number> {
  const rows = await db.execute<{ stock: number }>(sql`
    SELECT COALESCE(SUM(qty), 0)::int AS stock FROM stock_movements WHERE store_id = ${STORE_ID} AND medicine_id = ${medicineId}`);
  return rows[0]?.stock ?? 0;
}

async function ensureMedicine(name: string, packSize: string, batchNo: string) {
  const rows = await db.execute<{ id: number }>(sql`
    INSERT INTO medicines (store_id, name, pack_size, batch_no, mrp, purchase_price)
    VALUES (${STORE_ID}, ${name}, ${packSize}, ${batchNo}, '0', '0')
    ON CONFLICT (store_id, name, pack_size, batch_no) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`);
  return rows[0].id;
}

export const tools: ToolMap = {
  get_dashboard_metrics: {
    schema: GetDashboardMetrics,
    description: "Today's revenue and order count, 30-day revenue trend, top and slow movers, expiring-in-90-days value, low-stock count, credit (udhaar) outstanding.",
    run: async () => dashboardMetrics(),
  },
  get_expiring_stock: {
    schema: GetExpiringStock,
    description: "Medicines expiring within N days (default 90) with quantities and money at risk.",
    run: async ({ days }: { days: number }) => {
      const rows = await db.execute(sql`
        WITH cs AS (SELECT medicine_id, SUM(qty)::int AS qty FROM stock_movements
                    WHERE store_id = ${STORE_ID} GROUP BY medicine_id HAVING SUM(qty) > 0)
        SELECT m.name, m.pack_size, m.batch_no, m.expiry_date, cs.qty, (cs.qty * m.purchase_price)::text AS value_at_risk
        FROM cs JOIN medicines m ON m.id = cs.medicine_id
        WHERE m.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (${days} || ' days')::interval
        ORDER BY m.expiry_date`);
      return rows;
    },
  },
  get_low_stock: {
    schema: GetLowStock,
    description: "Medicines at or below their minimum stock level.",
    run: async () => {
      const rows = await db.execute(sql`
        WITH cs AS (SELECT medicine_id, SUM(qty)::int AS qty FROM stock_movements
                    WHERE store_id = ${STORE_ID} GROUP BY medicine_id HAVING SUM(qty) > 0)
        SELECT m.name, m.pack_size, cs.qty, m.min_stock FROM cs
        JOIN medicines m ON m.id = cs.medicine_id WHERE cs.qty <= m.min_stock ORDER BY cs.qty`);
      return rows;
    },
  },
  search_medicines: {
    schema: SearchMedicines,
    description: "Search medicines by name (trigram fuzzy match) with current stock and price.",
    run: async ({ query, limit }: { query: string; limit: number }) =>
      currentStock(sql`m.name ILIKE '%' || ${query} || '%'`, limit),
  },
  find_rack_location: {
    schema: FindRackLocation,
    description: "Find the rack/row/column where a medicine is placed.",
    run: async ({ query }: { query: string }) => {
      const rows = await db.execute(sql`
        SELECT m.name, r.code AS rack_code, m.row_no, m.col_no
        FROM medicines m LEFT JOIN racks r ON r.id = m.rack_id
        WHERE m.store_id = ${STORE_ID} AND m.name ILIKE '%' || ${query} || '%' LIMIT 10`);
      return rows;
    },
  },
  upsert_stock: {
    schema: UpsertStock,
    description: "Add new stock (purchase) for a medicine; creates the medicine if new. Records a purchase movement.",
    run: async (args) => {
      const a = UpsertStock.parse(args);
      let rackId: number | null = null;
      if (a.rackCode) {
        const rows = await db.execute<{ id: number }>(sql`
          INSERT INTO racks (store_id, code) VALUES (${STORE_ID}, ${a.rackCode})
          ON CONFLICT (store_id, code) DO UPDATE SET code = EXCLUDED.code RETURNING id`);
        rackId = rows[0].id;
      }
      const rows = await db.execute<{ id: number }>(sql`
        INSERT INTO medicines (store_id, name, pack_size, batch_no, expiry_date, mrp, purchase_price, rack_id, row_no, col_no)
        VALUES (${STORE_ID}, ${a.name}, ${a.packSize}, ${a.batchNo}, ${a.expiryDate ?? null}, ${a.mrp}, ${a.purchasePrice},
                ${rackId ?? null}, ${a.rowNo ?? null}, ${a.colNo ?? null})
        ON CONFLICT (store_id, name, pack_size, batch_no) DO UPDATE
          SET mrp = EXCLUDED.mrp, purchase_price = EXCLUDED.purchase_price, expiry_date = COALESCE(EXCLUDED.expiry_date, medicines.expiry_date),
              rack_id = COALESCE(EXCLUDED.rack_id, medicines.rack_id), row_no = COALESCE(EXCLUDED.row_no, medicines.row_no),
              col_no = COALESCE(EXCLUDED.col_no, medicines.col_no)
        RETURNING id`);
      const medicineId = rows[0].id;
      const mv = await db.execute<{ id: number }>(sql`
        INSERT INTO stock_movements (store_id, medicine_id, kind, qty, reason, ref_type)
        VALUES (${STORE_ID}, ${medicineId}, 'purchase', ${a.qty}, ${a.supplierName ?? "purchase"}, 'manual') RETURNING id`);
      return { medicineId, movementId: mv[0].id, addedQty: a.qty };
    },
  },
  update_stock_count: {
    schema: UpdateStockCount,
    description: "Correct stock to an exact counted quantity (shelf audit); writes an adjustment movement.",
    run: async (args) => {
      const a = UpdateStockCount.parse(args);
      const cur = await stockOf(a.medicineId);
      const diff = a.countedQty - cur;
      if (diff !== 0) {
        await db.execute(sql`
          INSERT INTO stock_movements (store_id, medicine_id, kind, qty, reason, ref_type)
          VALUES (${STORE_ID}, ${a.medicineId}, 'adjustment', ${diff}, ${a.reason}, 'manual')`);
      }
      return { medicineId: a.medicineId, previousStock: cur, newStock: a.countedQty };
    },
  },
  reduce_stock: {
    schema: ReduceStock,
    description: "Reduce stock by a quantity (damage, return, manual issue); writes an outbound movement.",
    run: async (args) => {
      const a = ReduceStock.parse(args);
      const cur = await stockOf(a.medicineId);
      if (cur < a.qty) throw new ToolError("insufficient_stock", `Stock is ${cur}, cannot reduce by ${a.qty}`);
      await db.execute(sql`
        INSERT INTO stock_movements (store_id, medicine_id, kind, qty, reason, ref_type)
        VALUES (${STORE_ID}, ${a.medicineId}, 'adjustment', ${-a.qty}, ${a.reason}, 'manual')`);
      return { medicineId: a.medicineId, previousStock: cur, newStock: cur - a.qty };
    },
  },
  delete_stock: {
    schema: DeleteStock,
    description: "Remove a medicine and its remaining stock completely (ledger 'delete' movement, stock zeroed).",
    run: async (args) => {
      const a = DeleteStock.parse(args);
      const cur = await stockOf(a.medicineId);
      if (cur > 0) {
        await db.execute(sql`
          INSERT INTO stock_movements (store_id, medicine_id, kind, qty, reason, ref_type)
          VALUES (${STORE_ID}, ${a.medicineId}, 'delete', ${-cur}, ${a.reason}, 'manual')`);
      }
      return { medicineId: a.medicineId, removedQty: cur };
    },
  },
  create_order: {
    schema: CreateOrder,
    description: "Create a customer sale (order) and generate the bill: verifies stock, writes sale movements, returns the invoice.",
    run: async (args) => {
      const a = CreateOrder.parse(args);
      return createOrderTx(a.customerName, a.customerPhone, a.paid, a.items);
    },
  },
};

export class ToolError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function createOrderTx(
  customerName: string,
  customerPhone: string | undefined,
  paid: number | undefined,
  items: { medicineId: number; qty: number }[],
) {
  const inv = await db.execute<{ next: number }>(sql`
    SELECT COALESCE(MAX(invoice_no), 1000) + 1 AS next FROM orders WHERE store_id = ${STORE_ID}`);
  const invoiceNo = inv[0].next;
  const lines: { medicineId: number; name: string; qty: number; unitPrice: number; lineTotal: number }[] = [];
  for (const it of items) {
    const rows = await db.execute<{ name: string; mrp: string; stock: number }>(sql`
      SELECT m.name, m.mrp, COALESCE((SELECT SUM(qty) FROM stock_movements WHERE medicine_id = m.id AND store_id = ${STORE_ID}), 0)::int AS stock
      FROM medicines m WHERE m.id = ${it.medicineId} AND m.store_id = ${STORE_ID}`);
    if (!rows[0]) throw new ToolError("not_found", `Medicine ${it.medicineId} not found`);
    if (rows[0].stock < it.qty) throw new ToolError("insufficient_stock", `${rows[0].name}: stock ${rows[0].stock}, need ${it.qty}`);
    lines.push({ medicineId: it.medicineId, name: rows[0].name, qty: it.qty, unitPrice: Number(rows[0].mrp), lineTotal: it.qty * Number(rows[0].mrp) });
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const gst = subtotal * 0.12;
  const total = subtotal + gst;
  const [order] = await db.execute<{ id: number }>(sql`
    INSERT INTO orders (store_id, invoice_no, customer_name, customer_phone, subtotal, gst_total, total, paid)
    VALUES (${STORE_ID}, ${invoiceNo}, ${customerName}, ${customerPhone ?? null}, ${subtotal.toFixed(2)}, ${gst.toFixed(2)}, ${total.toFixed(2)}, ${(paid ?? total).toFixed(2)})
    RETURNING id`);
  for (const l of lines) {
    await db.execute(sql`
      INSERT INTO order_items (order_id, medicine_id, name_snapshot, qty, unit_price, line_total)
      VALUES (${order.id}, ${l.medicineId}, ${l.name}, ${l.qty}, ${l.unitPrice.toFixed(2)}, ${l.lineTotal.toFixed(2)})`);
    await db.execute(sql`
      INSERT INTO stock_movements (store_id, medicine_id, kind, qty, reason, ref_type, ref_id)
      VALUES (${STORE_ID}, ${l.medicineId}, 'sale', ${-l.qty}, 'customer sale', 'order', ${order.id})`);
  }
  return {
    invoice: { invoiceNo, customerName, subtotal: +subtotal.toFixed(2), gst: +gst.toFixed(2), total: +total.toFixed(2),
      paid: paid ?? total, creditDue: +(total - (paid ?? total)).toFixed(2),
      items: lines.map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.lineTotal })) },
  };
}

export function toolDefinitions() {
  return Object.entries(tools).map(([name, t]) => ({
    type: "function" as const,
    function: {
      name,
      description: t.description,
      parameters: zodToJsonSchema(t.schema),
    },
  }));
}

// Minimal zod -> JSON Schema for the subset used here (objects, strings, numbers, arrays).
function zodToJsonSchema(schema: z.ZodTypeAny): object {
  const s = schema as unknown as { _def: { typeName: string; fields?: Record<string, z.ZodTypeAny> } };
  if (s._def.typeName === "ZodObject") {
    const props: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(s._def.fields ?? {})) {
      props[k] = zodToJsonSchema(v);
      const vd = (v as unknown as { _def: { typeName: string; defaultValue?: unknown } })._def;
      if (vd.typeName !== "ZodDefault" && vd.typeName !== "ZodOptional") required.push(k);
    }
    return { type: "object", properties: props, required };
  }
  const def = s._def;
  switch (def.typeName) {
    case "ZodString": return { type: "string" };
    case "ZodNumber": return { type: "number" };
    case "ZodArray": return { type: "array", items: zodToJsonSchema((schema as unknown as { element: z.ZodTypeAny }).element) };
    default: return {};
  }
}
