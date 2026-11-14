import { DEMO_MODE, demoStock, demoMetrics } from "./demo";
import { database, STORE_ID } from "@/db/mongo";
import { medicines, money } from "./repository";
export { STORE_ID };
export type StockRow = { medicine_id: number; name: string; pack_size: string; batch_no: string; expiry_date: string | null; mrp: string; stock: number; min_stock: number; rack_code: string | null; row_no: number | null; col_no: number | null };
const literal = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export async function currentStock(query = "", limit = 500, offset = 0): Promise<StockRow[]> {
  if (DEMO_MODE) return demoStock.filter(m => m.name.toLowerCase().includes(query.toLowerCase())).slice(offset, offset + limit);
  const db = await database();
  const rows = await medicines(db).find({ storeId: STORE_ID, stock: { $gt: 0 }, ...(query ? { name: { $regex: literal(query), $options: "i" } } : {}) }).sort({ name: 1 }).skip(offset).limit(limit).toArray();
  return rows.map(m => ({ medicine_id: m._id, name: m.name, pack_size: m.packSize, batch_no: m.batchNo, expiry_date: m.expiryDate, mrp: money(m.mrpCents).toFixed(2), stock: m.stock, min_stock: m.minStock, rack_code: m.rackCode, row_no: m.rowNo, col_no: m.colNo }));
}
export async function expiringStock(days = 90) {
  if (DEMO_MODE) return demoStock.filter(m => m.expiry_date <= new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)).map(m => ({ name: m.name, pack_size: m.pack_size, batch_no: m.batch_no, expiry_date: m.expiry_date, qty: m.stock, value_at_risk: Math.round(m.stock * Number(m.mrp) * .75 * 100) / 100 }));
  const db = await database(), today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  return (await medicines(db).find({ storeId: STORE_ID, stock: { $gt: 0 }, expiryDate: { $gte: today, $lte: end } }).sort({ expiryDate: 1 }).limit(500).toArray()).map(m => ({ name: m.name, pack_size: m.packSize, batch_no: m.batchNo, expiry_date: m.expiryDate, qty: m.stock, value_at_risk: money(m.stock * m.purchaseCents) }));
}
export async function lowStock() {
  if (DEMO_MODE) return demoStock.filter(m => m.stock <= m.min_stock).map(m => ({ name: m.name, pack_size: m.pack_size, qty: m.stock, min_stock: m.min_stock }));
  const db = await database();
  return (await medicines(db).find({ storeId: STORE_ID, $expr: { $lte: ["$stock", "$minStock"] } }).sort({ stock: 1 }).limit(500).toArray()).map(m => ({ name: m.name, pack_size: m.packSize, qty: m.stock, min_stock: m.minStock }));
}
export async function dashboardMetrics() {
  if (DEMO_MODE) return demoMetrics();
  const db = await database(), now = new Date();
  const today = new Date(now.toISOString().slice(0, 10)), since = new Date(today.getTime() - 29 * 86400000);
  const [daily, credit, expiry, low, movers, slow] = await Promise.all([
    db.collection("orders").aggregate<{ day: string; revenue: number; count: number }>([{ $match: { storeId: STORE_ID, createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: "UTC" } }, revenue: { $sum: "$totalCents" }, count: { $sum: 1 } } }, { $project: { _id: 0, day: "$_id", revenue: 1, count: 1 } }]).toArray(),
    db.collection("orders").aggregate<{ value: number }>([{ $match: { storeId: STORE_ID } }, { $group: { _id: null, value: { $sum: { $subtract: ["$totalCents", "$paidCents"] } } } }]).toArray(),
    medicines(db).aggregate<{ count: number; value: number }>([{ $match: { storeId: STORE_ID, stock: { $gt: 0 }, expiryDate: { $gte: today.toISOString().slice(0, 10), $lte: new Date(today.getTime() + 90 * 86400000).toISOString().slice(0, 10) } } }, { $group: { _id: null, count: { $sum: 1 }, value: { $sum: { $multiply: ["$stock", "$purchaseCents"] } } } }]).toArray(),
    medicines(db).countDocuments({ storeId: STORE_ID, $expr: { $lte: ["$stock", "$minStock"] } }),
    db.collection("orders").aggregate<{ name: string; qty: number; revenue: number }>([{ $match: { storeId: STORE_ID, createdAt: { $gte: since } } }, { $unwind: "$items" }, { $group: { _id: "$items.name", qty: { $sum: "$items.qty" }, revenue: { $sum: "$items.lineCents" } } }, { $sort: { qty: -1 } }, { $limit: 5 }, { $project: { _id: 0, name: "$_id", qty: 1, revenue: 1 } }]).toArray(),
    medicines(db).aggregate<{ name: string; qty: number }>([{ $match: { storeId: STORE_ID } }, { $lookup: { from: "movements", let: { id: "$_id" }, pipeline: [{ $match: { storeId: STORE_ID, kind: "sale", createdAt: { $gte: since }, $expr: { $eq: ["$medicineId", "$$id"] } } }, { $group: { _id: null, qty: { $sum: { $multiply: ["$qty", -1] } } } }], as: "sales" } }, { $project: { _id: 0, name: 1, qty: { $ifNull: [{ $arrayElemAt: ["$sales.qty", 0] }, 0] } } }, { $sort: { qty: 1 } }, { $limit: 5 }]).toArray(),
  ]);
  const todayData = daily.find(day => day.day === today.toISOString().slice(0, 10));
  return { todayRevenue: money(todayData?.revenue ?? 0), todayOrders: todayData?.count ?? 0, creditOutstanding: money(credit[0]?.value ?? 0), expiry90: { count: expiry[0]?.count ?? 0, value: money(expiry[0]?.value ?? 0) }, lowStockCount: low,
    trend: Array.from({ length: 30 }, (_, index) => { const day = new Date(since.getTime() + index * 86400000).toISOString().slice(0, 10); return { day, revenue: money(daily.find(value => value.day === day)?.revenue ?? 0) }; }), topMovers: movers.map(m => ({ ...m, revenue: money(m.revenue) })), slowMovers: slow };
}
export type Metrics = Awaited<ReturnType<typeof dashboardMetrics>>;
