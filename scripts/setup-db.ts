import { database, closeDatabase } from "../db/mongo";
async function main() {
  try { await database(); console.log("MongoDB indexes and store are ready"); }
  finally { await closeDatabase(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
