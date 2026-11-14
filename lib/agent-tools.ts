import { z } from "zod";
import { upsertStock, changeStock, sell, ToolError } from "./repository";
export { ToolError };
import { currentStock, dashboardMetrics, expiringStock, lowStock } from "@/lib/queries";

// ---------------------------------------------------------------------------
// Single source of truth for agent tool contracts. The REST routes validate
// request bodies with these schemas; the LLM agent gets them as JSON Schema.
// Every numeric answer is computed from database records here — never by the model.
// ---------------------------------------------------------------------------

export * from "./contracts";
import { SearchMedicines, FindRackLocation, GetDashboardMetrics, GetExpiringStock, GetLowStock, UpsertStock, UpdateStockCount, ReduceStock, DeleteStock, CreateOrder } from "./contracts";
export type ToolMap = { [name: string]: { schema: z.ZodType; run: (args: never) => Promise<unknown>; description: string } };
export const tools: ToolMap = {
  get_dashboard_metrics: { schema: GetDashboardMetrics, description: "Revenue, credit, expiry and stock metrics", run: async () => dashboardMetrics() },
  get_expiring_stock: { schema: GetExpiringStock, description: "Medicines expiring within N days", run: async args => expiringStock(GetExpiringStock.parse(args).days) },
  get_low_stock: { schema: GetLowStock, description: "Medicines at or below minimum stock", run: async () => lowStock() },
  search_medicines: { schema: SearchMedicines, description: "Search stock by medicine name", run: async args => { const a = SearchMedicines.parse(args); return currentStock(a.query, a.limit); } },
  find_rack_location: { schema: FindRackLocation, description: "Find medicine shelf placement", run: async args => currentStock(FindRackLocation.parse(args).query, 10) },
  upsert_stock: { schema: UpsertStock, description: "Add purchased stock", run: async args => { const a = UpsertStock.parse(args); return upsertStock(a); } },
  update_stock_count: { schema: UpdateStockCount, description: "Record physical count", run: async args => { const a = UpdateStockCount.parse(args); return changeStock(a.medicineId, "count", a.countedQty, a.reason); } },
  reduce_stock: { schema: ReduceStock, description: "Record an outbound adjustment", run: async args => { const a = ReduceStock.parse(args); return changeStock(a.medicineId, "reduce", a.qty, a.reason); } },
  delete_stock: { schema: DeleteStock, description: "Zero stock with an audit entry", run: async args => { const a = DeleteStock.parse(args); return changeStock(a.medicineId, "delete", 0, a.reason); } },
  create_order: { schema: CreateOrder, description: "Create a sale atomically", run: async args => { const a = CreateOrder.parse(args); return createOrderTx(a.customerName, a.customerPhone, a.paid, a.items); } },
};
export async function createOrderTx(customerName: string, customerPhone: string | undefined, paid: number | undefined, items: { medicineId: number; qty: number }[]) {
  const a = CreateOrder.parse({ customerName, customerPhone, paid, items });
  return sell(a.customerName, a.customerPhone, a.paid, a.items);
}
export function toolDefinitions() { return Object.entries(tools).map(([name, value]) => ({ type: "function" as const, function: { name, description: value.description, parameters: z.toJSONSchema(value.schema) } })); }
