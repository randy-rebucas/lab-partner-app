import 'server-only';
import mongoose from 'mongoose';

// One connection per server process, reused across hot reloads in development.
type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const globalForDb = globalThis as unknown as { __labDb?: Cache };
const cache: Cache = globalForDb.__labDb ?? { conn: null, promise: null };
globalForDb.__labDb = cache;

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  cache.promise ??= mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    autoIndex: process.env.NODE_ENV !== 'production',
  });
  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }
  return cache.conn;
}
