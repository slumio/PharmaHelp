import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { seedSampleData } from "@/db/seed";
it("seeds real SQL records only once and keeps stock equal to its ledger", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("db/schema.sql", "utf8"));
    expect(seedSampleData(db, 1)).toBe(true);
    const before = db.prepare("SELECT COUNT(*) n FROM orders").get() as {
      n: number;
    };
    expect(before.n).toBe(30);
    expect(seedSampleData(db, 1)).toBe(false);
    expect(db.prepare("SELECT COUNT(*) n FROM orders").get()).toEqual(before);
    expect(
      db
        .prepare(
          "SELECT m.id FROM medicines m LEFT JOIN movements s ON s.medicine_id=m.id GROUP BY m.id HAVING m.stock!=SUM(s.qty)",
        )
        .all(),
    ).toEqual([]);
  } finally {
    db.close();
  }
});
