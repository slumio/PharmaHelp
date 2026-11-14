import { beforeAll, afterAll, expect, it } from "vitest";
import { prepareAction, executeAction } from "@/lib/agent-actions";
import { currentStock } from "@/lib/queries";
import { closeDatabase, rows, run, STORE_ID } from "@/db/sqlite";
beforeAll(() => { if (!process.env.DATABASE_PATH?.endsWith("_test.sqlite")) throw new Error("Use a disposable test database"); });
afterAll(closeDatabase);
it("prepares without writing and confirms the same action exactly once", async () => {
  const name = `AI-${crypto.randomUUID()}`;
  const action = await prepareAction("upsert_stock", { name, mrp: 20, qty: 7 });
  expect(await currentStock(name)).toEqual([]);
  const results = await Promise.all([executeAction(action.id), executeAction(action.id)]);
  expect(results.filter(result => result.replay)).toHaveLength(1);
  expect((await currentStock(name))[0].stock).toBe(7);
  const audit = rows<{confirmed_at:string}>("SELECT confirmed_at FROM agent_actions WHERE id=? AND store_id=?", [action.id,STORE_ID])[0];
  expect(audit.confirmed_at).toBeTruthy();
});
it("rejects expired proposals without stock changes", async () => {
  const name = `Expired-${crypto.randomUUID()}`;
  const action = await prepareAction("upsert_stock", { name, mrp: 20, qty: 7 });
  run("UPDATE agent_actions SET expires_at=0 WHERE id=?", [action.id]);
  await expect(executeAction(action.id)).rejects.toThrow();
  expect(await currentStock(name)).toEqual([]);
});
