import { rows, STORE_ID } from "@/db/sqlite";
import { money } from "./repository";
export { STORE_ID };
export type StockRow = {
  medicine_id: number;
  name: string;
  pack_size: string;
  batch_no: string;
  expiry_date: string | null;
  mrp: string;
  stock: number;
  min_stock: number;
  rack_code: string | null;
  row_no: number | null;
  col_no: number | null;
};
export async function currentStock(
  term = "",
  limit = 500,
  offset = 0,
): Promise<StockRow[]> {
  return rows<Omit<StockRow, "mrp"> & { mrp: number }>(
    "SELECT id medicine_id,name,pack_size,batch_no,expiry_date,mrp,stock,min_stock,rack_code,row_no,col_no FROM medicines WHERE store_id=? AND stock>0 AND instr(lower(name),lower(?))>0 ORDER BY name LIMIT ? OFFSET ?",
    [STORE_ID, term, limit, offset],
  ).map((m) => ({ ...m, mrp: money(m.mrp).toFixed(2) }));
}
export async function expiringStock(days = 90) {
  return rows<{
    name: string;
    pack_size: string;
    batch_no: string;
    expiry_date: string;
    qty: number;
    value_at_risk: number;
  }>(
    "SELECT name,pack_size,batch_no,expiry_date,stock qty,stock*purchase value_at_risk FROM medicines WHERE store_id=? AND stock>0 AND expiry_date BETWEEN date('now') AND date('now',?) ORDER BY expiry_date LIMIT 500",
    [STORE_ID, `+${days} days`],
  ).map((m) => ({ ...m, value_at_risk: money(m.value_at_risk) }));
}
export async function lowStock() {
  return rows<{
    name: string;
    pack_size: string;
    qty: number;
    min_stock: number;
  }>(
    "SELECT name,pack_size,stock qty,min_stock FROM medicines WHERE store_id=? AND stock<=min_stock ORDER BY stock LIMIT 500",
    [STORE_ID],
  );
}
export async function dashboardMetrics() {
  const today = rows<{ revenue: number; count: number }>(
    "SELECT COALESCE(SUM(total),0) revenue,COUNT(*) count FROM orders WHERE store_id=? AND substr(created_at,1,10)=date('now')",
    [STORE_ID],
  )[0];
  const credit = rows<{ value: number }>(
    "SELECT COALESCE(SUM(total-paid),0) value FROM orders WHERE store_id=?",
    [STORE_ID],
  )[0];
  const expiry = rows<{ count: number; value: number }>(
    "SELECT COUNT(*) count,COALESCE(SUM(stock*purchase),0) value FROM medicines WHERE store_id=? AND stock>0 AND expiry_date BETWEEN date('now') AND date('now','+90 days')",
    [STORE_ID],
  )[0];
  const low = rows<{ count: number }>(
    "SELECT COUNT(*) count FROM medicines WHERE store_id=? AND stock<=min_stock",
    [STORE_ID],
  )[0];
  const daily = rows<{ day: string; revenue: number }>(
    "SELECT substr(created_at,1,10) day,SUM(total) revenue FROM orders WHERE store_id=? AND created_at>=date('now','-29 days') GROUP BY day",
    [STORE_ID],
  );
  const top = rows<{ name: string; qty: number; revenue: number }>(
    "SELECT json_extract(j.value,'$.name') name,SUM(json_extract(j.value,'$.qty')) qty,SUM(json_extract(j.value,'$.lineCents')) revenue FROM orders o,json_each(o.items) j WHERE o.store_id=? AND o.created_at>=date('now','-29 days') GROUP BY name ORDER BY qty DESC LIMIT 5",
    [STORE_ID],
  );
  const slow = rows<{ name: string; qty: number }>(
    "SELECT m.name,COALESCE(-SUM(s.qty),0) qty FROM medicines m LEFT JOIN movements s ON s.medicine_id=m.id AND s.store_id=m.store_id AND s.kind='sale' AND s.created_at>=date('now','-29 days') WHERE m.store_id=? GROUP BY m.id ORDER BY qty LIMIT 5",
    [STORE_ID],
  );
  return {
    todayRevenue: money(today.revenue),
    todayOrders: today.count,
    creditOutstanding: money(credit.value),
    expiry90: { count: expiry.count, value: money(expiry.value) },
    lowStockCount: low.count,
    trend: Array.from({ length: 30 }, (_, i) => {
      const day = new Date(Date.now() + (i - 29) * 86400000)
        .toISOString()
        .slice(0, 10);
      return {
        day,
        revenue: money(daily.find((d) => d.day === day)?.revenue ?? 0),
      };
    }),
    topMovers: top.map((m) => ({ ...m, revenue: money(m.revenue) })),
    slowMovers: slow,
  };
}
export type Metrics = Awaited<ReturnType<typeof dashboardMetrics>>;
