import { expect, it } from "vitest";
import { productionIssues } from "@/lib/production-config";
it("fails closed for missing production secrets and real data configuration", () => {
  expect(productionIssues({ NODE_ENV: "production" })).toHaveLength(3);
  expect(productionIssues({ NODE_ENV: "production", APP_USERNAME: "admin", APP_PASSWORD: "a-long-operator-password", AUTH_SECRET: "a-random-secret-with-at-least-thirty-two-characters" })).toEqual([]);
});
it("requires HTTPS outside localhost", () => {
  expect(productionIssues({ NODE_ENV: "production", APP_ORIGIN: "http://pharmacy.example" })).toContain("APP_ORIGIN must use HTTPS outside localhost");
});
