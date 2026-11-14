import { database,closeDatabase,STORE_ID } from "../db/sqlite";
import { seedSampleData } from "../db/seed";
try {
 if(process.env.ALLOW_DEMO_SEED!=="true")throw new Error("Set ALLOW_DEMO_SEED=true to populate an empty database with sample records.");
 console.log(seedSampleData(database(),STORE_ID)?"Seeded an empty SQLite store.":"Store is not empty; existing records were preserved.");
}finally{closeDatabase();}
