import { defineConfig } from "vitest/config";
import path from "path";
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30000, fileParallelism: false, env: { DATABASE_PATH: process.env.DATABASE_PATH ?? "/tmp/pharmahelp_test.sqlite", SEED_SAMPLE_DATA: "false" } },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
