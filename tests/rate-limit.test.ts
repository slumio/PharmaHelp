import { afterAll, beforeAll, expect, it } from "vitest";
import { rateLimit } from "@/lib/rate-limit";
import { closeDatabase } from "@/db/sqlite";
beforeAll(() => { if (!process.env.DATABASE_PATH?.endsWith("_test.sqlite")) throw new Error("Use a disposable test database"); });
afterAll(closeDatabase);
it("shares atomic rate-limit buckets across concurrent requests", async () => {
  const scope = `test-${crypto.randomUUID()}`;
  const results = await Promise.all(Array.from({ length: 10 }, () => rateLimit(scope, 5, 60)));
  expect(results.filter(result => result === null)).toHaveLength(5);
  expect(results.filter(result => result?.status === 429)).toHaveLength(5);
  expect(results.find(result => result?.status === 429)?.headers.get("Retry-After")).toBeTruthy();
});
