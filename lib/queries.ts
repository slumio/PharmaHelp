import { sql } from "drizzle-orm";
import { db } from "@/db";

export const STORE_ID = Number(process.env.STORE_ID ?? 1);

export type StockRow = { medicine_id: number; name: string; pack_size: string; batch_no: string; expiry_date: string; mrp: string; stock: number; min_stock: number; rack_code: string | null; row_no: number | null; col_no: number | null };

export async function currentStock(where = sql`true`, limit = 500, offset = 0) {
  const rows = await db.execute<StockRow>(sql`
    SELECT m.id AS medicine_id, m.name, m.pack_size, m.batch_no, m.expiry_date, m.mrp,
           COALESCE(SUM(sm.qty), 0)::int AS stock, m.min_stock,
           r.code AS rack_code, m.row_no, m.col_no
    FROM medicines m
    LEFT JOIN stock_movements sm ON sm.medicine_id = m.id AND sm.store_id = ${STORE_ID}
    LEFT JOIN racks r ON r.id = m.rack_id
    WHERE m.store_id = ${STORE_ID} AND ${where}
    GROUP BY m.id, r.code
    HAVING COALESCE(SUM(sm.qty), 0) <> 0
    ORDER BY m.name
    LIMIT ${limit} OFFSET ${offset}`);
  return rows;
}

export async function dashboardMetrics() {
  const [today] = await (
    await db.execute<{ revenue: string; orders: number }>(sql`
      SELECT COALESCE(SUM(total), 0)::text AS revenue, COUNT(*)::int AS orders
      FROM orders WHERE store_id = ${STORE_ID} AND created_at >= date_trunc('day', now())`)
  );
  const [credit] = await (
    await db.execute<{ outstanding: string }>(sql`
      SELECT COALESCE(SUM(total - paid), 0)::text AS outstanding
      FROM orders WHERE store_id = ${STORE_ID} AND total > paid`)
  );
  const [expiry] = await (
    await db.execute<{ value: string; count: number }>(sql`
      WITH cs AS (
        SELECT medicine_id, SUM(qty)::int AS qty
        FROM stock_movements WHERE store_id = ${STORE_ID} GROUP BY medicine_id HAVING SUM(qty) > 0)
      SELECT COALESCE(SUM(cs.qty * m.purchase_price), 0)::text AS value, COUNT(*)::int AS count
      FROM cs JOIN medicines m ON m.id = cs.medicine_id
      WHERE m.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`)
  );
  const [lowStock] = await (
    await db.execute<{ count: number }>(sql`
      WITH cs AS (
        SELECT medicine_id, SUM(qty)::int AS qty
        FROM stock_movements WHERE store_id = ${STORE_ID} GROUP BY medicine_id HAVING SUM(qty) > 0)
      SELECT COUNT(*)::int AS count FROM cs JOIN medicines m ON m.id = cs.medicine_id WHERE cs.qty <= m.min_stock`)
  );
  const trend = (
    await db.execute<{ day: string; revenue: string }>(sql`
      SELECT d::date::text AS day, COALESCE(SUM(o.total), 0)::text AS revenue
      FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') d
      LEFT JOIN orders o ON o.store_id = ${STORE_ID} AND date_trunc('day', o.created_at) = d
      GROUP BY d ORDER BY d`)
  );
  const topMovers = (
    await db.execute<{ name: string; qty: number; revenue: string }>(sql`
      SELECT oi.name_snapshot AS name, SUM(oi.qty)::int AS qty, SUM(oi.line_total)::text AS revenue
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.store_id = ${STORE_ID} AND o.created_at >= now() - INTERVAL '30 days'
      GROUP BY 1 ORDER BY SUM(oi.qty) DESC LIMIT 5`)
  );
  const slowMovers = (
    await db.execute<{ name: string; qty: number }>(sql`
      WITH sales AS (
        SELECT medicine_id, SUM(qty)::int AS qty
        FROM stock_movements WHERE store_id = ${STORE_ID} AND kind = 'sale' AND created_at >= now() - INTERVAL '30 days'
        GROUP BY medicine_id)
      SELECT m.name, COALESCE(s.qty, 0)::int AS qty
      FROM medicines m LEFT JOIN sales s ON s.medicine_id = m.id
      WHERE m.store_id = ${STORE_ID} ORDER BY COALESCE(s.qty, 0) ASC LIMIT 5`)
  );
  return {
    todayRevenue: Number(today.revenue),
    todayOrders: today.orders,
    creditOutstanding: Number(credit.outstanding),
    expiry90: { count: expiry.count, value: Number(expiry.value) },
    lowStockCount: lowStock.count,
    trend: trend.map((t) => ({ day: t.day, revenue: Number(t.revenue) })),
    topMovers: topMovers.map((t) => ({ name: t.name, qty: t.qty, revenue: Number(t.revenue) })),
    slowMovers,
  };
}

export type Metrics = Awaited<ReturnType<typeof dashboardMetrics>>;
