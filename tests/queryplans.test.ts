/**
 * Query-plan tests. On the small seeded dataset Postgres may rightly choose a
 * Seq Scan (cheaper than an index on 30 rows), so we verify two things:
 *  1. an index path EXISTS for each hot query (checked with enable_seqscan=off);
 *  2. the query meets its latency budget as the planner wants to run it.
 * Run: npm run test:plans  (needs seeded Postgres)
 */
import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";

const c = postgres("postgres://ubuntu:ubuntu@localhost:5432/app");

async function rawPlan(sqlText: string, forceIndex = false) {
  if (forceIndex) await c.unsafe("SET enable_seqscan = off");
  const rows = await c.unsafe(`EXPLAIN (ANALYZE, FORMAT JSON) ${sqlText}`);
  if (forceIndex) await c.unsafe("SET enable_seqscan = on");
  const raw = (rows as { "QUERY PLAN"?: unknown }[])[0]?.["QUERY PLAN"];
  const parsed = typeof raw === "string" ? JSON.parse(raw as string) : raw;
  return (Array.isArray(parsed) ? parsed[0] : parsed) as { Plan: Record<string, unknown>; "Execution Time": number };
}

function nodeTypes(plan: Record<string, unknown>): string[] {
  const out: string[] = [];
  const walk = (n: Record<string, unknown>) => {
    out.push(String(n["Node Type"]));
    for (const child of (n["Plans"] as Record<string, unknown>[]) ?? []) walk(child);
  };
  walk(plan);
  return out;
}

async function plan(sqlText: string, forceIndex = false) {
  const qp = await rawPlan(sqlText, forceIndex);
  return { nodes: nodeTypes(qp.Plan), ms: qp["Execution Time"] as number };
}

describe("hot query plans", () => {
  it("dashboard 30-day aggregate has an index path and runs under 50ms", async () => {
    const q = `SELECT date_trunc('day', o.created_at) d, SUM(o.total) FROM orders o WHERE o.store_id = 1 AND o.created_at >= now() - INTERVAL '30 days' GROUP BY 1`;
    const forced = await plan(q, true);
    expect(forced.nodes.some((n) => n.includes("Index"))).toBe(true);
    const { ms } = await plan(q);
    expect(ms).toBeLessThan(50);
  });

  it("medicine name search has a trigram index available and runs under 50ms", async () => {
    const idx = await c.unsafe(`SELECT indexname FROM pg_indexes WHERE tablename = 'medicines' AND indexdef LIKE '%gin_trgm_ops%'`);
    expect(idx.length).toBeGreaterThan(0);
    const { ms } = await plan(`SELECT id, name FROM medicines WHERE store_id = 1 AND name ILIKE '%dolo%'`);
    expect(ms).toBeLessThan(50);
  });

  it("expiry-in-90-days completes under 100ms", async () => {
    const { ms } = await plan(
      `WITH cs AS (SELECT medicine_id, SUM(qty)::int qty FROM stock_movements WHERE store_id = 1 GROUP BY medicine_id HAVING SUM(qty) > 0) SELECT m.name FROM cs JOIN medicines m ON m.id = cs.medicine_id WHERE m.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`,
    );
    expect(ms).toBeLessThan(100);
  });

  it("rack location lookup runs under 50ms", async () => {
    const { ms } = await plan(`SELECT m.name, r.code FROM medicines m JOIN racks r ON r.id = m.rack_id WHERE m.store_id = 1 AND r.code = 'A1'`);
    expect(ms).toBeLessThan(50);
  });

  afterAll(async () => { await c.end(); });
});
