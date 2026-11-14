import { AsyncLocalStorage } from "node:async_hooks";
import { MongoClient, type ClientSession, type Db } from "mongodb";

export const STORE_ID = Number(process.env.STORE_ID ?? 1);
if (!Number.isSafeInteger(STORE_ID) || STORE_ID < 1) throw new Error("STORE_ID must be a positive integer");
const activeTransaction = new AsyncLocalStorage<{ db: Db; session: ClientSession }>();
const cache = globalThis as typeof globalThis & { mongoConnection?: Promise<MongoClient>; mongoReady?: Promise<Db> };
export function connection(): Promise<MongoClient> {
  if (!cache.mongoConnection) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required");
    cache.mongoConnection = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 }).connect().catch(error => { cache.mongoConnection = undefined; throw error; });
  }
  return cache.mongoConnection;
}
export async function database(): Promise<Db> {
  if (!cache.mongoReady) cache.mongoReady = initialize().catch(error => { cache.mongoReady = undefined; throw error; });
  return cache.mongoReady;
}
async function initialize() {
  const client = await connection();
  const db = client.db(process.env.MONGODB_DB ?? "pharmahelp");
  await db.collection("medicines").createIndex({ storeId: 1, name: 1, packSize: 1, batchNo: 1 }, { unique: true });
  await db.collection("medicines").createIndex({ storeId: 1, expiryDate: 1 });
  await db.collection("medicines").createIndex({ storeId: 1, stock: 1 });
  await db.collection("orders").createIndex({ storeId: 1, invoiceNo: 1 }, { unique: true });
  await db.collection("orders").createIndex({ storeId: 1, createdAt: -1 });
  await db.collection("bills").createIndex({ storeId: 1, idempotencyKey: 1 }, { unique: true });
  await db.collection("movements").createIndex({ storeId: 1, medicineId: 1, createdAt: -1 });
  await db.collection("agent_actions").createIndex({ storeId: 1, id: 1 }, { unique: true });
  await db.collection("agent_actions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection("agent_runs").createIndex({ storeId: 1, createdAt: -1 });
  await db.collection<Store>("stores").updateOne({ _id: STORE_ID }, { $setOnInsert: { revision: 0, sequence: 0, invoice: 1000 } }, { upsert: true });
  return db;
}
type Store = { _id: number; revision: number; sequence: number; invoice: number };
export async function transaction<T>(work: (db: Db, session: ClientSession) => Promise<T>): Promise<T> {
  const existing = activeTransaction.getStore();
  if (existing) return work(existing.db, existing.session);
  const db = await database();
  const client = await connection();
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      // A shared store write gives all inventory writers the same conflict/retry boundary.
      await db.collection<Store>("stores").updateOne({ _id: STORE_ID }, { $inc: { revision: 1 } }, { session });
      return activeTransaction.run({ db, session }, () => work(db, session));
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, maxCommitTimeMS: 10000, timeoutMS: 30000 });
  } finally { await session.endSession(); }
}
export async function nextId(db: Db, session: ClientSession, invoice = false) {
  const field = invoice ? "invoice" : "sequence";
  const store = await db.collection<Store>("stores").findOneAndUpdate({ _id: STORE_ID }, { $inc: { [field]: 1 } }, { session, returnDocument: "after" });
  if (!store) throw new Error("Store not initialized");
  return store[field];
}
export async function closeDatabase() {
  if (cache.mongoConnection) await (await cache.mongoConnection).close();
  cache.mongoConnection = undefined; cache.mongoReady = undefined;
}
