import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { tools, createOrderTx, ToolError } from "@/lib/agent-tools";
import { dashboardMetrics, currentStock, lowStock } from "@/lib/queries";
import { database, closeDatabase, STORE_ID } from "@/db/mongo";
import { confirmBill, medicines } from "@/lib/repository";

const unique = () => `Test-${crypto.randomUUID()}`;
async function add(qty = 5) {
  const name = unique();
  const result = await tools.upsert_stock.run({ name, mrp: 10.01, purchasePrice: 8, qty } as never) as { medicineId: number };
  return { ...result, name };
}
beforeAll(async () => {
  if (!process.env.MONGODB_DB?.endsWith("_test")) throw new Error("Tests require a dedicated MONGODB_DB ending in _test");
  await database();
});
afterAll(closeDatabase);

describe("MongoDB inventory and transaction guarantees", () => {
  it("adds stock and exposes compatible frontend fields", async () => {
    const med = await add();
    const rows = await currentStock(med.name);
    expect(rows[0]).toMatchObject({ medicine_id: med.medicineId, stock: 5, mrp: "10.01" });
  });
  it("escapes regex metacharacters in medicine search", async () => {
    expect(await currentStock("[unclosed")).toEqual([]);
  });
  it("adjusts, reduces and zeros stock with ledger parity", async () => {
    const med = await add(10);
    await tools.reduce_stock.run({ medicineId: med.medicineId, qty: 2 } as never);
    await tools.update_stock_count.run({ medicineId: med.medicineId, countedQty: 4 } as never);
    const db = await database();
    const movements = await db.collection("movements").find({ medicineId: med.medicineId, storeId: STORE_ID }).toArray();
    expect(movements.reduce((sum, m) => sum + m.qty, 0)).toBe(4);
    await tools.delete_stock.run({ medicineId: med.medicineId } as never);
    expect(await currentStock(med.name)).toEqual([]);
    expect((await lowStock()).some(m => m.name === med.name && m.qty === 0)).toBe(true);
  });
  it("rejects overselling and negative quantities", async () => {
    const med = await add(2);
    await expect(createOrderTx("Customer", undefined, undefined, [{ medicineId: med.medicineId, qty: 3 }])).rejects.toThrow(ToolError);
    await expect(createOrderTx("Customer", undefined, undefined, [{ medicineId: med.medicineId, qty: -1 }])).rejects.toThrow();
    expect((await currentStock(med.name))[0].stock).toBe(2);
  });
  it("serializes concurrent sales", async () => {
    const med = await add(5);
    const results = await Promise.allSettled([1, 2].map(() => createOrderTx("Concurrent", undefined, undefined, [{ medicineId: med.medicineId, qty: 4 }])));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await currentStock(med.name))[0].stock).toBe(1);
  });
  it("consolidates duplicate sale lines before checking stock", async () => {
    const med = await add(3);
    await expect(createOrderTx("Duplicate", undefined, undefined, [{ medicineId: med.medicineId, qty: 2 }, { medicineId: med.medicineId, qty: 2 }])).rejects.toThrow(ToolError);
    expect((await currentStock(med.name))[0].stock).toBe(3);
  });
  it("uses integer cents for totals and rejects overpayment", async () => {
    const med = await add();
    await expect(createOrderTx("Customer", undefined, 1000, [{ medicineId: med.medicineId, qty: 1 }])).rejects.toThrow(ToolError);
    const result = await createOrderTx("Customer", undefined, 5, [{ medicineId: med.medicineId, qty: 3 }]);
    expect(result.invoice).toMatchObject({ subtotal: 30.03, gst: 3.6, total: 33.63, paid: 5, creditDue: 28.63 });
  });
  it("confirms bills once per idempotency key", async () => {
    const name = unique(), key = unique();
    const input = { supplierName: "Supplier", idempotencyKey: key, items: [{ name, packSize: "strip", batchNo: "NA", qty: 4, mrp: 20, purchasePrice: 12 }] };
    await confirmBill(input);
    await expect(confirmBill(input)).rejects.toThrow(ToolError);
    expect((await currentStock(name))[0].stock).toBe(4);
  });
  it("rolls back all bill writes when a later line fails", async () => {
    const name = unique(), key = unique();
    const input = { supplierName: "Supplier", idempotencyKey: key, items: [{ name, packSize: "strip", batchNo: "NA", qty: 4, mrp: 20, purchasePrice: 12 }, { name: unique(), packSize: "strip", batchNo: "NA", qty: BigInt(1), mrp: 20, purchasePrice: 12 }] };
    await expect(confirmBill(input as never)).rejects.toThrow();
    expect(await currentStock(name)).toEqual([]);
    expect(await (await database()).collection("bills").countDocuments({ idempotencyKey: key })).toBe(0);
  });
  it("isolates medicine mutations by store", async () => {
    const db = await database();
    const result = await medicines(db).insertOne({ _id: 900000001, storeId: STORE_ID + 1000, name: unique(), packSize: "strip", batchNo: "NA", stock: 3, mrpCents: 100, purchaseCents: 50, minStock: 10, expiryDate: null, rackCode: null, rowNo: null, colNo: null });
    try { await expect(tools.reduce_stock.run({ medicineId: result.insertedId, qty: 1 } as never)).rejects.toThrow(ToolError); }
    finally { await medicines(db).deleteOne({ _id: result.insertedId }); }
  });
  it("returns a complete 30-day metrics series", async () => {
    const metrics = await dashboardMetrics();
    expect(metrics.trend).toHaveLength(30);
    expect(Number.isFinite(metrics.todayRevenue)).toBe(true);
    expect(metrics.creditOutstanding).toBeGreaterThanOrEqual(0);
  });
});
