import { createOrderTx, tools } from "../lib/agent-tools";
import { closeDatabase } from "../db/mongo";
async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "true") throw new Error("Set ALLOW_DEMO_SEED=true to add demo records to a disposable database");
  try {
    for (const [index, name] of ["Dolo 650mg", "Crocin Advance", "Pan 40", "ORS Sachet"].entries()) {
      await tools.upsert_stock.run({ name, qty: 50, mrp: 25, purchasePrice: 18, batchNo: "DEMO", rackCode: `A${index + 1}`, rowNo: 0, colNo: 0, expiryDate: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10) } as never);
    }
    const med = await tools.search_medicines.run({ query: "Dolo" } as never) as { medicine_id: number }[];
    await createOrderTx("Demo Customer", undefined, undefined, [{ medicineId: med[0].medicine_id, qty: 1 }]);
    console.log("Added demo stock (existing data was preserved)");
  } finally { await closeDatabase(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
