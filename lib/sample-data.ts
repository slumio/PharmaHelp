// Fictional seed records. The actual server stores and mutates these in SQLite.
const dateAfter = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
export const sampleStock = [
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
