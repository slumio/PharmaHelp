import type { DatabaseSync } from "node:sqlite";
import { sampleStock } from "../lib/sample-data";
/** Populate only an empty store. Never reset or append on restart. */
export function seedSampleData(db: DatabaseSync, storeId: number) {
  const count = db
    .prepare("SELECT COUNT(*) n FROM medicines WHERE store_id=?")
    .get(storeId) as { n: number };
  if (count.n) return false;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      (
        db
          .prepare("SELECT COUNT(*) n FROM medicines WHERE store_id=?")
          .get(storeId) as { n: number }
      ).n
    ) {
      db.exec("COMMIT");
      return false;
    }
    const insert = db.prepare(
      "INSERT INTO medicines(store_id,name,pack_size,batch_no,expiry_date,mrp,purchase,stock,min_stock,rack_code,row_no,col_no) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    );
    for (const m of sampleStock) {
      const added = insert.run(
        storeId,
        m.name,
        m.pack_size,
        m.batch_no,
        m.expiry_date,
        Math.round(Number(m.mrp) * 100),
        Math.round(Number(m.mrp) * 75),
        m.stock,
        m.min_stock,
        m.rack_code,
        m.row_no,
        m.col_no,
      );
      db.prepare(
        "INSERT INTO movements(store_id,medicine_id,kind,qty,reason,ref_type) VALUES(?,?,'purchase',?,'Sample opening stock','sample')",
      ).run(storeId, Number(added.lastInsertRowid), m.stock);
    }
    const med = db
      .prepare(
        "SELECT id,name,mrp FROM medicines WHERE store_id=? AND name='Dolo 650mg'",
      )
      .get(storeId) as { id: number; name: string; mrp: number };
    for (let i = 0; i < 30; i++) {
      const qty = 1 + (i % 4),
        subtotal = med.mrp * qty,
        gst = Math.round(subtotal * 0.12),
        total = subtotal + gst,
        paid = i % 5 === 0 ? Math.floor(total / 2) : total;
      const date = new Date(Date.now() + (i - 29) * 86400000).toISOString(),
        lines = [
          {
            medicineId: med.id,
            name: med.name,
            qty,
            unitCents: med.mrp,
            lineCents: subtotal,
          },
        ];
      const order = db
        .prepare(
          "INSERT INTO orders(store_id,invoice_no,customer_name,subtotal,gst,total,paid,items,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          storeId,
          1001 + i,
          "Sample walk-in customer",
          subtotal,
          gst,
          total,
          paid,
          JSON.stringify(lines),
          date,
        );
      db.prepare("UPDATE medicines SET stock=stock-? WHERE id=?").run(
        qty,
        med.id,
      );
      db.prepare(
        "INSERT INTO movements(store_id,medicine_id,kind,qty,reason,ref_type,ref_id,created_at) VALUES(?,?,'sale',?,'Sample sale','order',?,?)",
      ).run(storeId, med.id, -qty, Number(order.lastInsertRowid), date);
    }
    db.prepare("INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)").run(
      `sample-store-${storeId}`,
      new Date().toISOString(),
    );
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
