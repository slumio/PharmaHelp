import { client, db, schema } from "../db";
import { TRIGRAM_SQL } from "../db/schema";
import { sql } from "drizzle-orm";

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]) => a[rand(a.length)];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (d: number) => iso(new Date(Date.now() + d * 86400000));

const MEDS: [string, string, string, string][] = [
  ["Dolo 650mg", "Paracetamol", "Micro Labs", "strip of 15"],
  ["Crocin Advance", "Paracetamol", "GSK", "strip of 15"],
  ["Augmentin 625 Duo", "Amoxicillin + Clavulanic", "GSK", "strip of 10"],
  ["Azithral 500", "Azithromycin", "Alembic", "strip of 5"],
  ["Pan 40", "Pantoprazole", "Alkem", "strip of 15"],
  ["Shelcal 500", "Calcium + Vit D3", "Torrent", "strip of 15"],
  ["Glycomet GP2", "Metformin + Glimepiride", "USV", "strip of 15"],
  ["Amaryl 2mg", "Glimepiride", "Sanofi", "strip of 10"],
  ["Telma 40", "Telmisartan", "Glenmark", "strip of 15"],
  ["Ecosprin 75", "Aspirin", "USV", "strip of 14"],
  ["Rosuvas 10", "Rosuvastatin", "Sun Pharma", "strip of 10"],
  ["Montek LC", "Montelukast + Levocetirizine", "Sun Pharma", "strip of 10"],
  ["Allegra 120", "Fexofenadine", "Sanofi", "strip of 10"],
  ["Zincovit", "Multivitamin", "Apex", "strip of 15"],
  ["Becosules", "B-Complex", "Pfizer", "strip of 20"],
  ["Digene Gel", "Antacid", "Abbott", "bottle 200ml"],
  ["Benadryl Syrup", "Diphenhydramine", "J&J", "bottle 150ml"],
  ["Volini Gel", "Diclofenac topical", "Sun Pharma", "tube 30g"],
  ["Moov Spray", "Topical analgesic", "Reckitt", "bottle 80g"],
  ["Betadine Ointment", "Povidone Iodine", "Win-Medicare", "tube 20g"],
  ["Dettol Antiseptic", "Chloroxylenol", "Reckitt", "bottle 110ml"],
  ["ORS Orange", "ORS powder", "FDC", "sachet 21g"],
  ["Meftal Spas", "Mefenamic + Dicyclomine", "Blue Cross", "strip of 10"],
  ["Sinarest", "Paracetamol combo", "Centaur", "strip of 10"],
  ["Nasivion Drops", "Oxymetazoline", "Merck", "bottle 10ml"],
  ["Thyronorm 50mcg", "Thyroxine", "Abbott", "bottle 120 tabs"],
  ["Ecosprin AV 75", "Aspirin + Atorvastatin", "USV", "strip of 10"],
  ["Udge Forte", "Ursodeoxycholic", "La Renon", "strip of 10"],
  ["Nurokind Plus", "Methylcobalamin", "Mankind", "strip of 10"],
  ["Cheston Cold", "Cetirizine combo", "Cipla", "strip of 10"],
];

const COMPANIES = ["MedPlus Distributors", "HealthFirst Pharma", "Apollo Wholesale", "Local Stockist"];

async function main() {
  await db.execute(TRIGRAM_SQL);
  await db.execute(sql`TRUNCATE agent_runs, order_items, orders, bill_items, bills, stock_movements, medicines, racks, stores RESTART IDENTITY CASCADE`);

  const [store] = await db
    .insert(schema.stores)
    .values({ name: "Sharma Medical Stores", ownerName: "Rajesh Sharma", gstin: "07ABCDE1234F1Z5" })
    .returning();
  const storeId = store.id;

  const rackRows = await db
    .insert(schema.racks)
    .values([
      { storeId, code: "A1", rows: 4, cols: 5 }, // front wall: fast movers
      { storeId, code: "B2", rows: 4, cols: 5 },
      { storeId, code: "C3", rows: 4, cols: 5 }, // back: slow movers
    ])
    .returning();

  const usedCells = new Set<string>();
  const freeCell = () => {
    for (let t = 0; t < 500; t++) {
      const r = pick(rackRows);
      const key = `${r.id}:${rand(r.rows)}:${rand(r.cols)}`;
      if (!usedCells.has(key)) {
        usedCells.add(key);
        return { rackId: r.id, rowNo: +key.split(":")[1], colNo: +key.split(":")[2] };
      }
    }
    return { rackId: rackRows[0].id, rowNo: 0, colNo: 0 };
  };

  const medValues = MEDS.map(([name, generic, company, pack], i) => {
    const cell = freeCell();
    const mrp = (20 + rand(280)).toFixed(2);
    return {
      storeId,
      name,
      genericName: generic,
      company,
      packSize: pack,
      batchNo: `B${2400 + i}`,
      expiryDate: daysFromNow([45, 75, 120, 200, 300, 400, 500][rand(7)]),
      mrp,
      purchasePrice: (Number(mrp) * 0.75).toFixed(2),
      rackId: cell.rackId,
      rowNo: cell.rowNo,
      colNo: cell.colNo,
      minStock: 15,
    };
  });
  const meds = await db.insert(schema.medicines).values(medValues).returning();

  // Opening purchase ledger spread over 90 days
  const movements: (typeof schema.stockMovements.$inferInsert)[] = [];
  for (const m of meds) {
    movements.push({
      storeId,
      medicineId: m.id,
      kind: "purchase",
      qty: 80 + rand(120),
      refType: "bill",
      reason: "opening stock",
      createdAt: new Date(Date.now() - (80 + rand(10)) * 86400000),
    });
  }
  // Supplier purchase bills over the last 60 days
  const billValues = Array.from({ length: 6 }, (_, i) => {
    const subtotal = 4000 + rand(9000);
    const gst = subtotal * 0.12;
    return {
      storeId,
      kind: "purchase",
      status: "confirmed",
      supplierName: pick(COMPANIES),
      subtotal: subtotal.toFixed(2),
      gstTotal: gst.toFixed(2),
      total: (subtotal + gst).toFixed(2),
      idempotencyKey: `seed-pur-${i}`,
      createdAt: new Date(Date.now() - (7 * (i + 1)) * 86400000),
    };
  });
  const purBills = await db.insert(schema.bills).values(billValues).returning();

  // Customer sale orders: ~70 orders over 60 days (today weighted)
  for (let d = 59; d >= 0; d--) {
    const n = d === 0 ? 3 + rand(4) : 1 + rand(3);
    for (let k = 0; k < n; k++) {
      const items = Array.from({ length: 1 + rand(3) }, () => pick(meds));
      const unique = [...new Map(items.map((m) => [m.id, m])).values()];
      let subtotal = 0;
      const lines = unique.map((m) => {
        const qty = 1 + rand(3);
        const unit = Number(m.mrp);
        subtotal += qty * unit;
        return { medicineId: m.id, nameSnapshot: m.name, qty, unitPrice: m.mrp, lineTotal: (qty * unit).toFixed(2) };
      });
      const gst = subtotal * 0.12;
      const total = subtotal + gst;
      const paid = Math.random() < 0.8 ? total : Math.round(total * 0.4);
      const [order] = await db
        .insert(schema.orders)
        .values({
          storeId,
          invoiceNo: 1000 + (60 - d) * 10 + k,
          customerName: pick(["Walk-in", "Sunita Devi", "Amit Kumar", "Ravi Verma", "Pooja Singh"]),
          customerPhone: "98" + String(100000000 + rand(899999999)),
          subtotal: subtotal.toFixed(2),
          gstTotal: gst.toFixed(2),
          total: total.toFixed(2),
          paid: paid.toFixed(2),
          createdAt: new Date(Date.now() - d * 86400000 - rand(10) * 3600000),
        })
        .returning();
      await db.insert(schema.orderItems).values(lines.map((l) => ({ ...l, orderId: order.id })));
      for (const l of lines) {
        movements.push({
          storeId,
          medicineId: l.medicineId!,
          kind: "sale",
          qty: -l.qty,
          refType: "order",
          refId: order.id,
          createdAt: order.createdAt,
        });
      }
    }
  }
  // Purchases leave stock with some medicines
  for (const m of meds.slice(0, 12)) {
    movements.push({
      storeId,
      medicineId: m.id,
      kind: "purchase",
      qty: 40 + rand(60),
      refType: "bill",
      refId: purBills[rand(6)].id,
      createdAt: new Date(Date.now() - rand(60) * 86400000),
    });
  }
  await db.insert(schema.stockMovements).values(movements);

  console.log(`Seeded store ${storeId}: ${meds.length} medicines, ${purBills.length} purchase bills, ${movements.length} ledger rows`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
