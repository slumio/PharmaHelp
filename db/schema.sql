PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS medicines (
 id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER NOT NULL,
 name TEXT NOT NULL, pack_size TEXT NOT NULL, batch_no TEXT NOT NULL, expiry_date TEXT,
 mrp INTEGER NOT NULL CHECK(mrp>=0), purchase INTEGER NOT NULL DEFAULT 0 CHECK(purchase>=0),
 stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0), min_stock INTEGER NOT NULL DEFAULT 10,
 rack_code TEXT, row_no INTEGER, col_no INTEGER, UNIQUE(store_id,name,pack_size,batch_no)
);
CREATE TABLE IF NOT EXISTS movements (
 id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER NOT NULL, medicine_id INTEGER NOT NULL REFERENCES medicines(id),
 kind TEXT NOT NULL, qty INTEGER NOT NULL, reason TEXT NOT NULL, ref_type TEXT, ref_id INTEGER,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER NOT NULL, invoice_no INTEGER NOT NULL,
 customer_name TEXT NOT NULL, customer_phone TEXT, subtotal INTEGER NOT NULL, gst INTEGER NOT NULL,
 total INTEGER NOT NULL, paid INTEGER NOT NULL CHECK(paid>=0 AND paid<=total), items TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(store_id,invoice_no)
);
CREATE TABLE IF NOT EXISTS bills (
 id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER NOT NULL, idem TEXT NOT NULL,
 supplier_name TEXT NOT NULL, items TEXT NOT NULL, total INTEGER NOT NULL, UNIQUE(store_id,idem)
);
CREATE TABLE IF NOT EXISTS agent_actions (
 id TEXT PRIMARY KEY, store_id INTEGER NOT NULL, tool TEXT NOT NULL, args TEXT NOT NULL,
 expires_at INTEGER NOT NULL, result TEXT, confirmed_at TEXT
);
CREATE TABLE IF NOT EXISTS agent_runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER NOT NULL, question TEXT NOT NULL,
 tool_calls TEXT NOT NULL, answer TEXT NOT NULL, model TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS rate_limits (id TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS medicines_store_stock ON medicines(store_id,stock);
CREATE INDEX IF NOT EXISTS medicines_store_expiry ON medicines(store_id,expiry_date);
CREATE INDEX IF NOT EXISTS movements_store_med ON movements(store_id,medicine_id,created_at);
CREATE INDEX IF NOT EXISTS orders_store_created ON orders(store_id,created_at);
