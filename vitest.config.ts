import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    env: { DATABASE_URL: "postgres://ubuntu:ubuntu@localhost:5432/app", STORE_ID: "1" },
  },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
