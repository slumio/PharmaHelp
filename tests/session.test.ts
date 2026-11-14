import { afterEach, expect, it, vi } from "vitest";
import { createSession, validSession } from "@/lib/session";
afterEach(() => vi.unstubAllEnvs());
it("accepts a signed session and rejects tampering or a rotated password", async () => {
  vi.stubEnv("APP_PASSWORD", "a-strong-test-password");
  const token = await createSession();
  expect(await validSession(token)).toBe(true);
  const [expires, signature] = token.split(".");
  expect(await validSession(`${Number(expires) + 1000}.${signature}`)).toBe(false);
  vi.stubEnv("APP_PASSWORD", "rotated-password");
  expect(await validSession(token)).toBe(false);
});
it("rejects absent, expired and malformed sessions", async () => {
  vi.stubEnv("APP_PASSWORD", "a-strong-test-password");
  expect(await validSession(undefined)).toBe(false);
  expect(await validSession("0.fake")).toBe(false);
  expect(await validSession("not-a-token")).toBe(false);
});
