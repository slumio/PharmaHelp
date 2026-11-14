import { expect, it } from "vitest";
import { correctOrigin } from "@/lib/origin";
it("accepts the public host including a nondefault port and rejects foreign origins", () => {
  expect(correctOrigin({ headers: new Headers({ host: "localhost:3100", origin: "http://localhost:3100" }) })).toBe(true);
  expect(correctOrigin({ headers: new Headers({ host: "store.example.com", origin: "https://attacker.example.com" }) })).toBe(false);
  expect(correctOrigin({ headers: new Headers({ host: "store.example.com", origin: "null" }) })).toBe(false);
});
