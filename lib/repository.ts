import { rows, run, transaction, STORE_ID } from "@/db/sqlite";
import {
  CreateOrder,
  DeleteStock,
  ReduceStock,
  UpdateStockCount,
  UpsertStock,
} from "./contracts";
export class ToolError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export type StockInput = {
  name: string;
  packSize: string;
  batchNo: string;
  expiryDate?: string;
  mrp: number;
  purchasePrice?: number;
  qty: number;
  rackCode?: string;
  rowNo?: number;
  colNo?: number;
  supplierName?: string;
};
type Med = {
  id: number;
  name: string;
  pack_size: string;
  batch_no: string;
  expiry_date: string | null;
  mrp: number;
  purchase: number;
  stock: number;
};
export function cents(value: number) {
  const amount = Math.round(value * 100);
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new ToolError("invalid_amount", "Invalid monetary amount");
  return amount;
}
export const money = (value: number) => value / 100;
function medicine(id: number) {
  const m = rows<Med>("SELECT * FROM medicines WHERE id=? AND store_id=?", [
    id,
    STORE_ID,
  ])[0];
  if (!m) throw new ToolError("not_found", "Medicine not found");
  return m;
}
function add(
  input: StockInput,
  refType = "manual",
  refId: number | null = null,
) {
  const a = UpsertStock.parse(input);
  let m = rows<Med>(
    "SELECT * FROM medicines WHERE store_id=? AND name=? AND pack_size=? AND batch_no=?",
    [STORE_ID, a.name, a.packSize, a.batchNo],
  )[0];
  if (!m) {
    const result = run(
      "INSERT INTO medicines(store_id,name,pack_size,batch_no,expiry_date,mrp,purchase,rack_code,row_no,col_no) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [
        STORE_ID,
        a.name,
        a.packSize,
        a.batchNo,
        a.expiryDate ?? null,
        cents(a.mrp),
        cents(a.purchasePrice ?? 0),
        a.rackCode ?? null,
        a.rowNo ?? null,
        a.colNo ?? null,
      ],
    );
    m = medicine(Number(result.lastInsertRowid));
  }
  run(
    "UPDATE medicines SET stock=stock+?,mrp=?,purchase=?,expiry_date=COALESCE(?,expiry_date),rack_code=COALESCE(?,rack_code),row_no=COALESCE(?,row_no),col_no=COALESCE(?,col_no) WHERE id=? AND store_id=?",
    [
      a.qty,
      cents(a.mrp),
      a.purchasePrice === undefined ? m.purchase : cents(a.purchasePrice),
      a.expiryDate ?? null,
      a.rackCode ?? null,
      a.rowNo ?? null,
      a.colNo ?? null,
      m.id,
      STORE_ID,
    ],
  );
  const movement = run(
    "INSERT INTO movements(store_id,medicine_id,kind,qty,reason,ref_type,ref_id) VALUES(?,?,'purchase',?,?,?,?)",
    [STORE_ID, m.id, a.qty, a.supplierName ?? "Purchase", refType, refId],
  );
  return {
    medicineId: m.id,
    movementId: Number(movement.lastInsertRowid),
    addedQty: a.qty,
  };
}
function change(
  id: number,
  mode: "count" | "reduce" | "delete",
  qty: number,
  reason: string,
) {
  const m = medicine(id),
    target = mode === "count" ? qty : mode === "delete" ? 0 : m.stock - qty;
  if (!Number.isSafeInteger(target) || target < 0)
    throw new ToolError("insufficient_stock", `Stock is ${m.stock}`);
  const delta = target - m.stock;
  run("UPDATE medicines SET stock=? WHERE id=? AND store_id=?", [
    target,
    id,
    STORE_ID,
  ]);
  if (delta)
    run(
      "INSERT INTO movements(store_id,medicine_id,kind,qty,reason,ref_type) VALUES(?,?,?,?,?,'manual')",
      [
        STORE_ID,
        id,
        mode === "delete" ? "delete" : "adjustment",
        delta,
        reason,
      ],
    );
  return {
    medicineId: id,
    previousStock: m.stock,
    newStock: target,
    removedQty: m.stock - target,
  };
}
function sale(raw: unknown) {
  const a = CreateOrder.parse(raw),
    merged = new Map<number, number>();
  for (const item of a.items)
    merged.set(item.medicineId, (merged.get(item.medicineId) ?? 0) + item.qty);
  const lines = [...merged].map(([medicineId, qty]) => {
    const m = medicine(medicineId);
    if (m.stock < qty)
      throw new ToolError(
        "insufficient_stock",
        `${m.name}: stock ${m.stock}, need ${qty}`,
      );
    if (m.expiry_date && m.expiry_date < new Date().toISOString().slice(0, 10))
      throw new ToolError("expired_stock", `${m.name} has expired`);
    return {
      medicineId,
      name: m.name,
      qty,
      unitCents: m.mrp,
      lineCents: m.mrp * qty,
    };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineCents, 0),
    gst = Math.round(subtotal * 0.12),
    total = subtotal + gst,
    paid = a.paid === undefined ? total : cents(a.paid);
  if (!Number.isSafeInteger(total))
    throw new ToolError("invalid_amount", "Invoice exceeds supported amount");
  if (paid > total)
    throw new ToolError("invalid_payment", "Payment exceeds total");
  const invoiceNo = rows<{ next: number }>(
    "SELECT COALESCE(MAX(invoice_no),1000)+1 next FROM orders WHERE store_id=?",
    [STORE_ID],
  )[0].next;
  const order = run(
      "INSERT INTO orders(store_id,invoice_no,customer_name,customer_phone,subtotal,gst,total,paid,items) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        STORE_ID,
        invoiceNo,
        a.customerName,
        a.customerPhone ?? null,
        subtotal,
        gst,
        total,
        paid,
        JSON.stringify(lines),
      ],
    ),
    orderId = Number(order.lastInsertRowid);
  for (const line of lines) {
    run("UPDATE medicines SET stock=stock-? WHERE id=? AND store_id=?", [
      line.qty,
      line.medicineId,
      STORE_ID,
    ]);
    run(
      "INSERT INTO movements(store_id,medicine_id,kind,qty,reason,ref_type,ref_id) VALUES(?,?,'sale',?,'Customer sale','order',?)",
      [STORE_ID, line.medicineId, -line.qty, orderId],
    );
  }
  return {
    invoice: {
      invoiceNo,
      customerName: a.customerName,
      subtotal: money(subtotal),
      gst: money(gst),
      total: money(total),
      paid: money(paid),
      creditDue: money(total - paid),
      items: lines.map((l) => ({
        name: l.name,
        qty: l.qty,
        unitPrice: money(l.unitCents),
        lineTotal: money(l.lineCents),
      })),
    },
  };
}
/** Internal synchronous dispatch; caller must hold the SQL transaction. */
export function applyMutation(tool: string, args: unknown): unknown {
  if (tool === "upsert_stock") return add(UpsertStock.parse(args));
  if (tool === "create_order") return sale(args);
  if (tool === "reduce_stock") {
    const a = ReduceStock.parse(args);
    return change(a.medicineId, "reduce", a.qty, a.reason);
  }
  if (tool === "update_stock_count") {
    const a = UpdateStockCount.parse(args);
    return change(a.medicineId, "count", a.countedQty, a.reason);
  }
  if (tool === "delete_stock") {
    const a = DeleteStock.parse(args);
    return change(a.medicineId, "delete", 0, a.reason);
  }
  throw new ToolError("invalid_action", "Unknown stock action");
}
export async function upsertStock(input: StockInput) {
  return transaction(() => add(input));
}
export async function changeStock(
  id: number,
  mode: "count" | "reduce" | "delete",
  qty: number,
  reason: string,
) {
  return transaction(() => change(id, mode, qty, reason));
}
export async function sell(
  customerName: string,
  customerPhone: string | undefined,
  paid: number | undefined,
  items: { medicineId: number; qty: number }[],
) {
  return transaction(() => sale({ customerName, customerPhone, paid, items }));
}
export async function confirmBill(input: {
  supplierName: string;
  idempotencyKey: string;
  items: StockInput[];
}) {
  return transaction(() => {
    if (
      rows("SELECT id FROM bills WHERE store_id=? AND idem=?", [
        STORE_ID,
        input.idempotencyKey,
      ]).length
    )
      throw new ToolError("duplicate", "Bill already processed");
    const subtotal = input.items.reduce(
        (s, i) => s + cents(i.purchasePrice ?? 0) * i.qty,
        0,
      ),
      total = subtotal + Math.round(subtotal * 0.12);
    if (!Number.isSafeInteger(total) || !input.items.length)
      throw new ToolError("invalid_bill", "Invalid bill total or items");
    const bill = run(
        "INSERT INTO bills(store_id,idem,supplier_name,items,total) VALUES(?,?,?,?,?)",
        [
          STORE_ID,
          input.idempotencyKey,
          input.supplierName,
          JSON.stringify(input.items),
          total,
        ],
      ),
      billId = Number(bill.lastInsertRowid);
    for (const item of input.items)
      add({ ...item, supplierName: input.supplierName }, "bill", billId);
    return {
      billId,
      items: input.items.length,
      unitsAdded: input.items.reduce((s, i) => s + i.qty, 0),
      total: money(total),
    };
  });
}
export async function listOrders() {
  return rows<{
    id: number;
    invoice_no: number;
    customer_name: string;
    total: number;
    paid: number;
    created_at: string;
    items: string;
  }>(
    "SELECT * FROM orders WHERE store_id=? ORDER BY created_at DESC LIMIT 50",
    [STORE_ID],
  ).map((o) => ({
    ...o,
    total: money(o.total),
    paid: money(o.paid),
    credit_due: money(o.total - o.paid),
    items: (
      JSON.parse(o.items) as { name: string; qty: number; lineCents: number }[]
    ).map((l) => ({ name: l.name, qty: l.qty, lineTotal: money(l.lineCents) })),
  }));
}
