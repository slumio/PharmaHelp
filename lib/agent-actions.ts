import { randomUUID } from "node:crypto";
import { database, STORE_ID, transaction } from "@/db/mongo";
import { tools, ToolError } from "./agent-tools";
import { medicines } from "./repository";
import { DEMO_MODE, demoStock } from "./demo";
export const mutationTools = new Set(["upsert_stock", "update_stock_count", "reduce_stock", "delete_stock", "create_order"]);
export type ProposedAction = { id: string; tool: string; args: unknown; expiresAt: Date; demo: boolean; review: { label: string; value: string }[] };
export async function prepareAction(name: string, args: unknown): Promise<ProposedAction> {
  if (!mutationTools.has(name)) throw new ToolError("invalid_action", "Unknown action");
  const validated = tools[name].schema.parse(args);
  const fields = validated as Record<string, unknown>;
  const labels: Record<string, string> = { name: "Medicine", packSize: "Pack", batchNo: "Batch", qty: "Quantity to add / remove", countedQty: "New stock count", mrp: "MRP", purchasePrice: "Purchase price", expiryDate: "Expiry", rackCode: "Rack", rowNo: "Shelf row", colNo: "Shelf column", supplierName: "Supplier", reason: "Reason", customerName: "Customer", customerPhone: "Phone", paid: "Amount paid" };
  const describeMedicine = async (id: number) => {
    const med = DEMO_MODE ? demoStock.find(m => m.medicine_id === id) : await medicines(await database()).findOne({ _id: id, storeId: STORE_ID });
    if (!med) throw new ToolError("not_found", "Medicine not found in this store");
    return `${med.name} · batch ${"batchNo" in med ? med.batchNo : med.batch_no}`;
  };
  const review: { label: string; value: string }[] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (field === "medicineId") review.push({ label: "Medicine", value: await describeMedicine(Number(value)) });
    else if (field === "items" && Array.isArray(value)) {
      for (const line of value as { medicineId: number; qty: number }[]) review.push({ label: `Sell ${line.qty} units`, value: await describeMedicine(line.medicineId) });
    } else review.push({ label: labels[field] ?? field, value: ["mrp", "purchasePrice", "paid"].includes(field) ? `₹${Number(value).toFixed(2)}` : String(value) });
  }
  const action = { review, id: randomUUID(), tool: name, args: validated, expiresAt: new Date(Date.now() + 15 * 60 * 1000), demo: DEMO_MODE };
  if (!DEMO_MODE) await (await database()).collection("agent_actions").insertOne({ ...action, storeId: STORE_ID, status: "pending", createdAt: new Date() });
  return action;
}
export async function executeAction(id: string) {
  if (DEMO_MODE) throw new ToolError("demo_readonly", "Connect MongoDB and disable demo mode to save changes");
  return transaction(async (db, session) => {
    const collection = db.collection("agent_actions");
    const action = await collection.findOne({ id, storeId: STORE_ID }, { session });
    if (!action) throw new ToolError("not_found", "Action not found");
    if (action.status === "confirmed") return { result: action.result, replay: true };
    if (action.expiresAt <= new Date()) throw new ToolError("expired_action", "This proposal expired. Ask again to prepare a fresh action.");
    if (!mutationTools.has(action.tool)) throw new ToolError("invalid_action", "Unknown action");
    // Tool transactions reuse this session: result and confirmation commit together.
    const result = await tools[action.tool].run(action.args as never);
    await collection.updateOne({ id, storeId: STORE_ID }, { $set: { status: "confirmed", result, confirmedAt: new Date() }, $unset: { expiresAt: "" } }, { session });
    return { result, replay: false };
  });
}
