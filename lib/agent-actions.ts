import { randomUUID } from "node:crypto";
import { rows, run, transaction, STORE_ID } from "@/db/sqlite";
import { tools, ToolError } from "./agent-tools";
import { applyMutation } from "./repository";
export const mutationTools = new Set([
  "upsert_stock",
  "reduce_stock",
  "update_stock_count",
  "delete_stock",
  "create_order",
]);
export type ProposedAction = {
  id: string;
  tool: string;
  args: unknown;
  expiresAt: Date;
  review: { label: string; value: string }[];
};
export async function prepareAction(
  name: string,
  args: unknown,
): Promise<ProposedAction> {
  if (!mutationTools.has(name))
    throw new ToolError("invalid_action", "Unknown action");
  const validated = tools[name].schema.parse(args),
    fields = validated as Record<string, unknown>;
  const labels: Record<string, string> = {
    name: "Medicine",
    packSize: "Pack",
    batchNo: "Batch",
    qty: "Quantity",
    countedQty: "New stock count",
    mrp: "MRP",
    purchasePrice: "Purchase price",
    expiryDate: "Expiry",
    rackCode: "Rack",
    rowNo: "Shelf row",
    colNo: "Shelf column",
    supplierName: "Supplier",
    reason: "Reason",
    customerName: "Customer",
    customerPhone: "Phone",
    paid: "Amount paid",
  };
  const describe = (id: number) => {
    const m = rows<{ name: string; batch_no: string }>(
      "SELECT name,batch_no FROM medicines WHERE id=? AND store_id=?",
      [id, STORE_ID],
    )[0];
    if (!m) throw new ToolError("not_found", "Medicine not found");
    return `${m.name} · batch ${m.batch_no}`;
  };
  const review: { label: string; value: string }[] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (field === "medicineId")
      review.push({ label: "Medicine", value: describe(Number(value)) });
    else if (field === "items" && Array.isArray(value)) {
      for (const line of value as { medicineId: number; qty: number }[])
        review.push({
          label: `Sell ${line.qty} units`,
          value: describe(line.medicineId),
        });
    } else
      review.push({
        label: labels[field] ?? field,
        value: ["mrp", "purchasePrice", "paid"].includes(field)
          ? `₹${Number(value).toFixed(2)}`
          : String(value),
      });
  }
  const action = {
    id: randomUUID(),
    tool: name,
    args: validated,
    expiresAt: new Date(Date.now() + 900000),
    review,
  };
  run(
    "INSERT INTO agent_actions(id,store_id,tool,args,expires_at) VALUES(?,?,?,?,?)",
    [
      action.id,
      STORE_ID,
      name,
      JSON.stringify(validated),
      action.expiresAt.getTime(),
    ],
  );
  return action;
}
export async function executeAction(id: string) {
  return transaction(() => {
    const action = rows<{
      tool: string;
      args: string;
      expires_at: number;
      result: string | null;
    }>("SELECT * FROM agent_actions WHERE id=? AND store_id=?", [
      id,
      STORE_ID,
    ])[0];
    if (!action) throw new ToolError("not_found", "Action not found");
    if (action.result)
      return { result: JSON.parse(action.result), replay: true };
    if (action.expires_at <= Date.now())
      throw new ToolError(
        "expired_action",
        "This proposal expired. Prepare a fresh change.",
      );
    const result = applyMutation(action.tool, JSON.parse(action.args));
    run(
      "UPDATE agent_actions SET result=?,confirmed_at=? WHERE id=? AND store_id=?",
      [JSON.stringify(result), new Date().toISOString(), id, STORE_ID],
    );
    return { result, replay: false };
  });
}
