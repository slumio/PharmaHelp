import { afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
afterEach(() => vi.unstubAllEnvs());
it("identifies missing production settings without exposing secret values", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_USERNAME", "");
  vi.stubEnv("APP_PASSWORD", "private-short");
  vi.stubEnv("AUTH_SECRET", "private-key");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("APP_ORIGIN", "https://pharmahelp.example");
  const response = await GET();
  const body = await response.json();
  expect(response.status).toBe(503);
  expect(body.issues).toEqual(["APP_USERNAME is required", "APP_PASSWORD must contain at least 16 characters", "AUTH_SECRET must contain at least 32 characters"]);
  expect(JSON.stringify(body)).not.toContain("private-short");
  expect(JSON.stringify(body)).not.toContain("private-key");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
