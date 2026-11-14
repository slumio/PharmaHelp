import {
  pgTable, serial, integer, text, timestamp, numeric, date, index, uniqueIndex, jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerName: text("owner_name"),
  gstin: text("gstin"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const racks = pgTable(
  "racks",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id),
    code: text("code").notNull(),
    rows: integer("rows").notNull().default(4),
    cols: integer("cols").notNull().default(6),
  },
  (t) => [uniqueIndex("racks_store_code_uq").on(t.storeId, t.code)],
);

export const medicines = pgTable(
  "medicines",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id),
    name: text("name").notNull(),
    genericName: text("generic_name"),
    company: text("company"),
    packSize: text("pack_size"),
    batchNo: text("batch_no"),
    expiryDate: date("expiry_date"),
    mrp: numeric("mrp", { precision: 10, scale: 2 }).notNull().default("0"),
    purchasePrice: numeric("purchase_price", { precision: 10, scale: 2 }).notNull().default("0"),
    rackId: integer("rack_id").references(() => racks.id),
    rowNo: integer("row_no"),
    colNo: integer("col_no"),
    minStock: integer("min_stock").notNull().default(10),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("medicines_store_rack_idx").on(t.storeId, t.rackId),
    index("medicines_expiry_idx").on(t.storeId, t.expiryDate),
    uniqueIndex("medicines_store_name_pack_uq").on(t.storeId, t.name, t.packSize, t.batchNo),
  ],
);

// Immutable ledger: current stock = SUM of movements per medicine. Auditable.
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id),
    medicineId: integer("medicine_id")
      .notNull()
      .references(() => medicines.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // purchase | sale | adjustment | delete
    qty: integer("qty").notNull(), // signed: + in, - out
    reason: text("reason"),
    refType: text("ref_type"), // bill | order | manual
    refId: integer("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("movements_store_med_idx").on(t.storeId, t.medicineId),
    index("movements_created_idx").on(t.storeId, t.createdAt),
  ],
);

export const bills = pgTable(
  "bills",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id),
    kind: text("kind").notNull().default("purchase"), // purchase (supplier bill) | sale (customer bill)
    status: text("status").notNull().default("draft"), // draft | confirmed
    supplierName: text("supplier_name"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    gstTotal: numeric("gst_total", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    sourceImageUrl: text("source_image_url"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("bills_idem_uq").on(t.storeId, t.idempotencyKey),
    index("bills_store_kind_idx").on(t.storeId, t.kind, t.createdAt),
  ],
);

export const billItems = pgTable(
  "bill_items",
  {
    id: serial("id").primaryKey(),
    billId: integer("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    medicineId: integer("medicine_id").references(() => medicines.id),
    nameSnapshot: text("name_snapshot").notNull(),
    packSize: text("pack_size"),
    batchNo: text("batch_no"),
    expiryDate: date("expiry_date"),
    qty: integer("qty").notNull(),
    mrp: numeric("mrp", { precision: 10, scale: 2 }).notNull().default("0"),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull().default("0"),
    rawRow: jsonb("raw_row"), // original OCR/CSV row for audit
  },
  (t) => [index("bill_items_bill_idx").on(t.billId)],
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id),
    invoiceNo: integer("invoice_no").notNull(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    gstTotal: numeric("gst_total", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    paid: numeric("paid", { precision: 12, scale: 2 }).notNull().default("0"), // credit (udhaar) = total - paid
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("orders_store_invoice_uq").on(t.storeId, t.invoiceNo),
    index("orders_store_created_idx").on(t.storeId, t.createdAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    medicineId: integer("medicine_id").references(() => medicines.id),
    nameSnapshot: text("name_snapshot").notNull(),
    qty: integer("qty").notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull().default("0"),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull(),
    question: text("question").notNull(),
    toolCalls: jsonb("tool_calls").notNull(), // [{tool, args, resultRows}]
    answer: text("answer").notNull(),
    model: text("model"), // llm model name, or "rule-router" fallback
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agent_runs_store_idx").on(t.storeId, t.createdAt)],
);

// trigram index for medicine search (created raw because drizzle-kit lacks gin opclass sugar)
export const TRIGRAM_SQL = sql`
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS medicines_name_trgm_idx ON medicines USING gin (name gin_trgm_ops);
`;
