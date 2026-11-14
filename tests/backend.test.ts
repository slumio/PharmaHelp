/**
 * Backend tests: every agent tool runs its exact SQL against the real seeded
 * database and the results are asserted. Run: npm test  (needs seeded Postgres)
 */
import { describe, it, expect, afterAll } from "vitest";
import { tools, ToolError, createOrderTx } from "@/lib/agent-tools";
import { dashboardMetrics, currentStock } from "@/lib/queries";
import { client } from "@/db";

const afterAllClose = async () => { await client.end(); };

describe("query layer: exact SQL results", () => {
  it("dashboardMetrics computes today's revenue from orders", async () => {
    const m = await dashboardMetrics();
    expect(m.todayRevenue).toBeGreaterThanOrEqual(0);
    expect(m.trend).toHaveLength(30);
    expect(m.topMovers.length).toBeGreaterThan(0);
    expect(m.slowMovers.length).toBeGreaterThan(0);
    expect(Number.isFinite(m.expiry90.value)).toBe(true);
  });

  it("currentStock returns stock equal to SUM(ledger)", async () => {
    const rows = await currentStock();
    const res = (await client.unsafe(
      `SELECT m.id, COALESCE(SUM(sm.qty),0)::int stock FROM medicines m
       LEFT JOIN stock_movements sm ON sm.medicine_id = m.id WHERE m.store_id = 1 GROUP BY m.id ORDER BY m.id LIMIT 1`,
    )) as unknown as { id: number; stock: number }[];
    const first = rows.find((r) => r.medicine_id === (res[0] as { id: number }).id);
    expect(first?.stock).toBe((res[0] as { stock: number }).stock);
  });
});

describe("agent tools run real SQL", () => {
  it("get_expiring_stock returns rows with value_at_risk", async () => {
    const rows = (await tools.get_expiring_stock.run({ days: 90 } as never)) as { value_at_risk: string }[];
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) expect(Number(r.value_at_risk)).toBeGreaterThanOrEqual(0);
  });

  it("search_medicines finds Dolo by name", async () => {
    const rows = (await tools.search_medicines.run({ query: "Dolo" } as never)) as { name: string }[];
    expect(rows.some((r) => r.name.includes("Dolo"))).toBe(true);
  });

  it("find_rack_location returns rack placement", async () => {
    const rows = (await tools.find_rack_location.run({ query: "Dolo" } as never)) as { rack_code: string | null }[];
    expect(rows[0]).toBeDefined();
  });

  it("upsert_stock inserts, then reduce_stock and update_stock_count move the ledger", async () => {
    const up = (await tools.upsert_stock.run({
      name: "TestMed 10mg", packSize: "strip of 10", batchNo: "T1", mrp: 50, purchasePrice: 40, qty: 25, rackCode: "Z9",
    } as never)) as { medicineId: number };
    const stock1 = await tools.search_medicines.run({ query: "TestMed" } as never) as { stock: number }[];
    expect(stock1[0].stock).toBe(25);

    await tools.reduce_stock.run({ medicineId: up.medicineId, qty: 5 } as never);
    const stock2 = (await tools.search_medicines.run({ query: "TestMed" } as never)) as { stock: number }[];
    expect(stock2[0].stock).toBe(20);

    await tools.update_stock_count.run({ medicineId: up.medicineId, countedQty: 12 } as never);
    const stock3 = (await tools.search_medicines.run({ query: "TestMed" } as never)) as { stock: number }[];
    expect(stock3[0].stock).toBe(12);

    await tools.delete_stock.run({ medicineId: up.medicineId } as never);
    const stock4 = (await tools.search_medicines.run({ query: "TestMed" } as never)) as { stock: number }[];
    expect(stock4[0]?.stock ?? 0).toBe(0);
  });

  it("reduce_stock refuses to go negative", async () => {
    const up = (await tools.upsert_stock.run({ name: "NegMed", mrp: 10, qty: 3 } as never)) as { medicineId: number };
    await expect(tools.reduce_stock.run({ medicineId: up.medicineId, qty: 10 } as never)).rejects.toThrow(ToolError);
    await tools.delete_stock.run({ medicineId: up.medicineId } as never);
  });

  it("createOrderTx generates invoice, GST and deducts stock", async () => {
    const med = (await tools.search_medicines.run({ query: "Crocin" } as never)) as { medicine_id: number; stock: number }[];
    const before = med[0].stock;
    const order = await createOrderTx("Test Customer", "9999999999", undefined, [{ medicineId: med[0].medicine_id, qty: 2 }]);
    expect(order.invoice.invoiceNo).toBeGreaterThan(1000);
    expect(order.invoice.gst).toBeCloseTo(order.invoice.subtotal * 0.12, 2);
    expect(order.invoice.items[0].qty).toBe(2);
    const after = (await tools.search_medicines.run({ query: "Crocin" } as never)) as { stock: number }[];
    expect(after[0].stock).toBe(before - 2);
  });

  it("createOrderTx rejects overselling", async () => {
    const med = (await tools.search_medicines.run({ query: "ORS" } as never)) as { medicine_id: number; stock: number }[];
    await expect(createOrderTx("Test", undefined, undefined, [{ medicineId: med[0].medicine_id, qty: med[0].stock + 100 }]))
      .rejects.toThrow(ToolError);
  });

  afterAll(afterAllClose);
});
