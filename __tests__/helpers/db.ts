import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll } from 'vitest';

/**
 * Give a test file its own in-memory MongoDB. lib/db.ts's connection cache is pointed at it,
 * so code under test that calls connectDB() uses it too. Collections are emptied after each test.
 */
export function setupTestDb() {
  let server: MongoMemoryServer;

  beforeAll(async () => {
    // Several files start one at once; on Windows that can take well over the 10 s default.
    server = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
    const uri = server.getUri();
    process.env.MONGODB_URI = uri;
    await mongoose.connect(uri);
    (globalThis as unknown as { __labDb: unknown }).__labDb = { conn: mongoose, promise: Promise.resolve(mongoose) };
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  });

  afterEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await server?.stop();
  });
}
