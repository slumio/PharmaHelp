import { seedSampleData } from "./seed";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
export const STORE_ID = Number(process.env.STORE_ID ?? 1);
if (!Number.isSafeInteger(STORE_ID) || STORE_ID < 1)
  throw new Error("STORE_ID must be a positive integer");
const shared = globalThis as typeof globalThis & {
  pharmaSqlite?: DatabaseSync;
};
export function database() {
  if (!shared.pharmaSqlite) {
    const path = resolve(process.env.DATABASE_PATH ?? "data/pharmahelp.sqlite");
    mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;",
    );
    db.exec(readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8"));
    if (process.env.SEED_SAMPLE_DATA === "true") seedSampleData(db, STORE_ID);
    shared.pharmaSqlite = db;
  }
  return shared.pharmaSqlite;
}
export function rows<T extends object = Record<string, unknown>>(
  sql: string,
  values: SQLInputValue[] = [],
): T[] {
  return database()
    .prepare(sql)
    .all(...values) as T[];
}
export function run(sql: string, values: SQLInputValue[] = []) {
  return database()
    .prepare(sql)
    .run(...values);
}
/** Work stays synchronous so another request cannot enter an uncommitted transaction. */
export function transaction<T>(work: () => T): T {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    if (result instanceof Promise)
      throw new Error("SQL transactions must not perform asynchronous work");
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function closeDatabase() {
  shared.pharmaSqlite?.close();
  shared.pharmaSqlite = undefined;
}
