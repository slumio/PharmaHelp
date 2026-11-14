import postgres from "postgres";
import { client } from "../db";

const QUERIES: [string, string][] = [
  ["dashboard 30-day aggregates", `EXPLAIN (ANALYZE) SELECT date_trunc('day', o.created_at) d, SUM(o.total) FROM orders o WHERE o.store_id = 1 AND o.created_at >= now() - INTERVAL '30 days' GROUP BY 1`],
  ["expiry-in-90-days join", `EXPLAIN (ANALYZE) WITH cs AS (SELECT medicine_id, SUM(qty)::int qty FROM stock_movements WHERE store_id = 1 GROUP BY medicine_id HAVING SUM(qty) > 0) SELECT m.name FROM cs JOIN medicines m ON m.id = cs.medicine_id WHERE m.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`],
  ["medicine name search", `EXPLAIN (ANALYZE) SELECT id, name FROM medicines WHERE store_id = 1 AND name ILIKE '%dolo%'`],
  ["rack location lookup", `EXPLAIN (ANALYZE) SELECT m.name, r.code FROM medicines m JOIN racks r ON r.id = m.rack_id WHERE m.store_id = 1 AND r.code = 'A1'`],
];

async function main() {
  for (const [label, q] of QUERIES) {
    const rows = await client.unsafe(q);
    const text = rows.map((r) => Object.values(r)[0]).join("\n");
    const scan = /Index (Only )?Scan|Bitmap Index Scan|Seq Scan/.exec(text)?.[0] ?? "?";
    const time = /Execution Time: ([\d.]+) ms/.exec(text)?.[1] ?? "?";
    console.log(`${label}: ${scan}, ${time} ms`);
  }
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
