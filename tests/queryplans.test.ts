import { afterAll, expect, it } from "vitest";
import { database, closeDatabase } from "@/db/mongo";
afterAll(closeDatabase);
it("installs store-scoped uniqueness and lookup indexes", async () => {
  if (!process.env.MONGODB_DB?.endsWith("_test")) throw new Error("Use a test database");
  const db = await database();
  const indexes = await db.collection("medicines").indexes();
  expect(indexes.some(index => index.unique && index.key.storeId === 1 && index.key.batchNo === 1)).toBe(true);
  expect((await db.collection("orders").indexes()).some(index => index.unique && index.key.invoiceNo === 1)).toBe(true);
});
