import { database,closeDatabase } from "../db/sqlite";
try { database(); console.log("SQLite schema is ready. Existing records were preserved."); }
finally { closeDatabase(); }
