import { beforeAll, afterAll, expect, it } from "vitest";
import { prepareAction, executeAction } from "@/lib/agent-actions";
import { currentStock } from "@/lib/queries";
import { closeDatabase, database, STORE_ID } from "@/db/mongo";
beforeAll(() => { if (!process.env.MONGODB_DB?.endsWith("_test")) throw new Error("Use a disposable test database"); });
afterAll(closeDatabase);
it("prepares without writing and confirms the same action exactly once", async () => {
  const name = `AI-${crypto.randomUUID()}`;
  const action = await prepareAction("upsert_stock", { name, mrp: 20, qty: 7 });
  expect(await currentStock(name)).toEqual([]);
  const results = await Promise.all([executeAction(action.id), executeAction(action.id)]);
  expect(results.filter(result => result.replay)).toHaveLength(1);
  expect((await currentStock(name))[0].stock).toBe(7);
  const audit = await (await database()).collection("agent_actions").findOne({ id: action.id, storeId: STORE_ID });
  expect(audit?.status).toBe("confirmed");
});
it("rejects expired proposals without stock changes", async () => {
  const name = `Expired-${crypto.randomUUID()}`;
  const action = await prepareAction("upsert_stock", { name, mrp: 20, qty: 7 });
  await (await database()).collection("agent_actions").updateOne({ id: action.id }, { $set: { expiresAt: new Date(0) } });
  await expect(executeAction(action.id)).rejects.toThrow();
  expect(await currentStock(name)).toEqual([]);
});
