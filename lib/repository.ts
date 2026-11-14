import { DEMO_MODE, demoOrders } from "./demo";
import type { ClientSession, Db } from "mongodb";
import { database, nextId, STORE_ID, transaction } from "@/db/mongo";

export class ToolError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export type Medicine = {
  _id: number; storeId: number; name: string; packSize: string; batchNo: string;
  expiryDate: string | null; mrpCents: number; purchaseCents: number; stock: number;
  minStock: number; rackCode: string | null; rowNo: number | null; colNo: number | null;
};
export type StockInput = { name: string; packSize: string; batchNo: string; expiryDate?: string; mrp: number; purchasePrice?: number; qty: number; rackCode?: string; rowNo?: number; colNo?: number; supplierName?: string };
export const cents = (value: number) => Math.round(value * 100);
export const money = (value: number) => value / 100;
export const medicines = (db: Db) => db.collection<Medicine>("medicines");
export async function addStock(db: Db, session: ClientSession, input: StockInput, refType = "manual", refId?: number) {
  const filter = { storeId: STORE_ID, name: input.name, packSize: input.packSize, batchNo: input.batchNo };
  let med = await medicines(db).findOne(filter, { session });
  if (!med) {
    med = { _id: await nextId(db, session), ...filter, expiryDate: input.expiryDate ?? null, mrpCents: cents(input.mrp), purchaseCents: cents(input.purchasePrice ?? 0), stock: 0, minStock: 10, rackCode: input.rackCode ?? null, rowNo: input.rowNo ?? null, colNo: input.colNo ?? null };
    await medicines(db).insertOne(med, { session });
  }
  await medicines(db).updateOne({ _id: med._id, storeId: STORE_ID }, { $inc: { stock: input.qty }, $set: { mrpCents: cents(input.mrp), purchaseCents: cents(input.purchasePrice ?? money(med.purchaseCents)), ...(input.expiryDate ? { expiryDate: input.expiryDate } : {}), ...(input.rackCode ? { rackCode: input.rackCode } : {}), ...(input.rowNo !== undefined ? { rowNo: input.rowNo } : {}), ...(input.colNo !== undefined ? { colNo: input.colNo } : {}) } }, { session });
  const movement = await db.collection("movements").insertOne({ storeId: STORE_ID, medicineId: med._id, kind: "purchase", qty: input.qty, reason: input.supplierName ?? "purchase", refType, refId, createdAt: new Date() }, { session });
  return { medicineId: med._id, movementId: movement.insertedId.toHexString(), addedQty: input.qty };
}
export async function changeStock(id: number, mode: "count" | "reduce" | "delete", qty: number, reason: string) {
  return transaction(async (db, session) => {
    const med = await medicines(db).findOne({ _id: id, storeId: STORE_ID }, { session });
    if (!med) throw new ToolError("not_found", "Medicine not found");
    const target = mode === "count" ? qty : mode === "delete" ? 0 : med.stock - qty;
    if (target < 0) throw new ToolError("insufficient_stock", `Stock is ${med.stock}`);
    const delta = target - med.stock;
    if (delta) {
      await medicines(db).updateOne({ _id: id, storeId: STORE_ID }, { $set: { stock: target } }, { session });
      await db.collection("movements").insertOne({ storeId: STORE_ID, medicineId: id, kind: mode === "delete" ? "delete" : "adjustment", qty: delta, reason, refType: "manual", createdAt: new Date() }, { session });
    }
    return { medicineId: id, previousStock: med.stock, newStock: target, removedQty: med.stock - target };
  });
}
export async function sell(customerName: string, customerPhone: string | undefined, paid: number | undefined, items: { medicineId: number; qty: number }[]) {
  return transaction(async (db, session) => {
    const merged = new Map<number, number>();
    for (const item of items) merged.set(item.medicineId, (merged.get(item.medicineId) ?? 0) + item.qty);
    const lines = [];
    for (const [medicineId, qty] of merged) {
      const med = await medicines(db).findOne({ _id: medicineId, storeId: STORE_ID }, { session });
      if (!med) throw new ToolError("not_found", "Medicine not found");
      if (med.stock < qty) throw new ToolError("insufficient_stock", `${med.name}: stock ${med.stock}, need ${qty}`);
      if (med.expiryDate && med.expiryDate < new Date().toISOString().slice(0, 10)) throw new ToolError("expired_stock", `${med.name} has expired`);
      lines.push({ medicineId, name: med.name, qty, unitCents: med.mrpCents, lineCents: med.mrpCents * qty });
    }
    const subtotalCents = lines.reduce((sum, line) => sum + line.lineCents, 0);
    const gstCents = Math.round(subtotalCents * 0.12), totalCents = subtotalCents + gstCents;
    const paidCents = paid === undefined ? totalCents : cents(paid);
    if (paidCents > totalCents) throw new ToolError("invalid_payment", "Payment exceeds total");
    const id = await nextId(db, session), invoiceNo = await nextId(db, session, true);
    await db.collection("orders").insertOne({ id, storeId: STORE_ID, invoiceNo, customerName, customerPhone, subtotalCents, gstCents, totalCents, paidCents, items: lines, createdAt: new Date() }, { session });
    for (const line of lines) {
      const result = await medicines(db).updateOne({ _id: line.medicineId, storeId: STORE_ID, stock: { $gte: line.qty } }, { $inc: { stock: -line.qty } }, { session });
      if (!result.modifiedCount) throw new ToolError("insufficient_stock", "Stock changed; retry sale");
      await db.collection("movements").insertOne({ storeId: STORE_ID, medicineId: line.medicineId, kind: "sale", qty: -line.qty, reason: "customer sale", refType: "order", refId: id, createdAt: new Date() }, { session });
    }
    return { invoice: { invoiceNo, customerName, subtotal: money(subtotalCents), gst: money(gstCents), total: money(totalCents), paid: money(paidCents), creditDue: money(totalCents - paidCents), items: lines.map(line => ({ name: line.name, qty: line.qty, unitPrice: money(line.unitCents), lineTotal: money(line.lineCents) })) } };
  });
}
export async function confirmBill(input: { supplierName: string; idempotencyKey: string; items: StockInput[] }) {
  return transaction(async (db, session) => {
    if (await db.collection("bills").findOne({ storeId: STORE_ID, idempotencyKey: input.idempotencyKey }, { session })) throw new ToolError("duplicate", "Bill already processed");
    const billId = await nextId(db, session);
    const subtotalCents = input.items.reduce((sum, item) => sum + cents(item.purchasePrice ?? 0) * item.qty, 0);
    const totalCents = subtotalCents + Math.round(subtotalCents * 0.12);
    await db.collection("bills").insertOne({ storeId: STORE_ID, id: billId, supplierName: input.supplierName, idempotencyKey: input.idempotencyKey, items: input.items, subtotalCents, totalCents, createdAt: new Date() }, { session });
    for (const item of input.items) await addStock(db, session, { ...item, supplierName: input.supplierName }, "bill", billId);
    return { billId, items: input.items.length, unitsAdded: input.items.reduce((sum, item) => sum + item.qty, 0), total: money(totalCents) };
  });
}
export async function listOrders() {
  if (DEMO_MODE) return demoOrders;
  const db = await database();
  return (await db.collection("orders").find({ storeId: STORE_ID }).sort({ createdAt: -1 }).limit(50).toArray()).map(order => ({ id: order.id, invoice_no: order.invoiceNo, customer_name: order.customerName, total: money(order.totalCents), paid: money(order.paidCents), credit_due: money(order.totalCents - order.paidCents), created_at: order.createdAt, items: order.items.map((line: { name: string; qty: number; lineCents: number }) => ({ name: line.name, qty: line.qty, lineTotal: money(line.lineCents) })) }));
}
