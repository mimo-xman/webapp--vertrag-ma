// Database connection with automatic in-memory fallback for development.
// In production, set MONGODB_URI + DB_NAME. Without them, a local
// in-memory MongoDB is started and seeded with demo data (dev preview mode).

import mongoose from "mongoose";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  memoryServer: import("mongodb-memory-server").MongoMemoryServer | null;
  seeded: boolean;
};

declare global {
   
  var _vertragMongoose: MongooseCache | undefined;
}

const cache: MongooseCache = globalThis._vertragMongoose ?? {
  conn: null,
  promise: null,
  memoryServer: null,
  seeded: false,
};
globalThis._vertragMongoose = cache;

export const IS_DEV_DB = !process.env.MONGODB_URI;

async function startMemoryServer() {
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const mongod = await MongoMemoryServer.create();
  cache.memoryServer = mongod;
  console.log(`[DB] In-memory MongoDB started (dev preview mode): ${mongod.getUri()}`);
  return mongod.getUri() + (process.env.DB_NAME || "vertrag_ma");
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) {
    await ensureSeeded();
    return cache.conn;
  }

  if (!cache.promise) {
    const uri = process.env.MONGODB_URI || (await startMemoryServer());
    const dbName = process.env.DB_NAME || "vertrag_ma";
    cache.promise = mongoose
      .connect(uri, { dbName })
      .then((m) => {
        console.log(`[DB] Connected to ${dbName}`);
        return m;
      })
      .catch(async (err) => {
        cache.promise = null;
        throw err;
      });
  }

  cache.conn = await cache.promise;
  await ensureSeeded();
  return cache.conn;
}

// In dev-preview mode, seeds demo data once per process (idempotent).
async function ensureSeeded(): Promise<void> {
  if (!IS_DEV_DB || cache.seeded) return;
  cache.seeded = true; // set first to avoid concurrent double-seeding
  try {
    const { seedIfEmpty } = await import("./seed");
    await seedIfEmpty();
  } catch (e) {
    console.error("[SEED] Failed:", e);
  }
}
