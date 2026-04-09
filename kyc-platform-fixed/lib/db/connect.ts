import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || '';

// Cache the connection across Next.js hot-reloads in development
let cached: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } =
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
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export function isMongoConfigured(): boolean {
  return !!MONGODB_URI;
}
