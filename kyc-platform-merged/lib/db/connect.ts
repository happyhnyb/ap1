import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || '';
const IS_PROD = process.env.NODE_ENV === 'production';

// Production must not imply demo persistence when the database is missing.
if (IS_PROD && !MONGODB_URI) {
  console.error('[db] ERROR: MONGODB_URI is not set. Persistent data features will be unavailable.');
}

// Cache the connection across Next.js hot-reloads in development
const cached: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } =
  (global as unknown as { _mongooseCache?: typeof cached })._mongooseCache ?? { conn: null, promise: null };

(global as unknown as { _mongooseCache: typeof cached })._mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Add it to your .env file.');
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }).catch((err) => {
      // Clear the cached promise on failure so the next call retries
      cached.promise = null;
      throw err;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export function isMongoConfigured(): boolean {
  return !!MONGODB_URI;
}
