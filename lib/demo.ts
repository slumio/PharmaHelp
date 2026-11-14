// Fictional records for the read-only product preview. No customer information.
export const DEMO_MODE = process.env.DEMO_MODE === "true";
const dateAfter = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
export const demoStock = [
  [1, "Dolo 650mg", "strip of 15", "DL-2408", 32.5, 148, "A1", 0, 0, 180],
  [2, "Pan 40", "strip of 15", "PN-1102", 165, 8, "A1", 0, 1, 75],
  [3, "Augmentin 625 Duo", "strip of 10", "AG-0824", 223.8, 42, "A1", 1, 0, 240],
  [4, "Crocin Advance", "strip of 15", "CR-1210", 28, 95, "A2", 0, 0, 45],
  [5, "Azithral 500", "strip of 5", "AZ-0501", 131.6, 36, "A2", 0, 1, 210],
  [6, "Shelcal 500", "strip of 15", "SH-0322", 144.3, 64, "A2", 1, 0, 320],
  [7, "ORS Sachet", "sachet", "OR-0890", 22, 6, "B1", 0, 0, 30],
  [8, "Cetirizine 10mg", "strip of 10", "CT-0912", 21, 112, "B1", 0, 1, 400],
  [9, "Glycomet GP2", "strip of 15", "GL-0221", 118.5, 9, "B1", 1, 0, 290],
  [10, "Betadine Ointment", "20g tube", "BT-0371", 115, 24, "B2", 0, 0, 165],
  [11, "Vitamin C 500", "strip of 15", "VC-0407", 55, 72, "B2", 0, 1, 60],
  [12, "Digital Thermometer", "unit", "DT-0011", 199, 18, "B2", 1, 0, 730],
].map(([id, name, pack, batch, mrp, stock, rack, row, col, days]) => ({ medicine_id: Number(id), name: String(name), pack_size: String(pack), batch_no: String(batch), expiry_date: dateAfter(Number(days)), mrp: Number(mrp).toFixed(2), stock: Number(stock), min_stock: 10, rack_code: String(rack), row_no: Number(row), col_no: Number(col) }));
export const demoOrders = [
  { id: 1, invoice_no: 1048, customer_name: "Walk-in customer", total: 728, paid: 728, credit_due: 0, created_at: new Date().toISOString(), items: [{ name: "Dolo 650mg", qty: 2, lineTotal: 65 }, { name: "Pan 40", qty: 4, lineTotal: 660 }] },
  { id: 2, invoice_no: 1047, customer_name: "Demo customer A", total: 368.48, paid: 200, credit_due: 168.48, created_at: new Date(Date.now() - 3600000).toISOString(), items: [{ name: "Azithral 500", qty: 2, lineTotal: 263.2 }] },
  { id: 3, invoice_no: 1046, customer_name: "Demo customer B", total: 448, paid: 448, credit_due: 0, created_at: new Date(Date.now() - 7200000).toISOString(), items: [{ name: "Digital Thermometer", qty: 2, lineTotal: 398 }] },
];
export function demoMetrics() {
  const expiring = demoStock.filter(m => m.expiry_date <= dateAfter(90));
  return { todayRevenue: 12840, todayOrders: 48, creditOutstanding: 3260, expiry90: { count: expiring.length, value: Math.round(expiring.reduce((sum, m) => sum + Number(m.mrp) * .75 * m.stock, 0) * 100) / 100 }, lowStockCount: demoStock.filter(m => m.stock <= m.min_stock).length,
    trend: Array.from({ length: 30 }, (_, i) => ({ day: dateAfter(i - 29), revenue: i === 29 ? 12840 : Math.round(6500 + i * 142 + Math.sin(i * 1.7) * 2200 + Math.cos(i * .6) * 1200) })),
    topMovers: [{ name: "Dolo 650mg", qty: 284, revenue: 9230 }, { name: "Pan 40", qty: 196, revenue: 32340 }, { name: "Crocin Advance", qty: 172, revenue: 4816 }, { name: "Cetirizine 10mg", qty: 148, revenue: 3108 }, { name: "Shelcal 500", qty: 94, revenue: 13564.2 }], slowMovers: [{ name: "Betadine Ointment", qty: 8 }, { name: "Digital Thermometer", qty: 12 }] };
}
