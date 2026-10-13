import mongoose from 'mongoose';

// Shared by the Next.js app and the sync worker, so it must not import
// `server-only` or anything from `next/*`.

type MongooseCache = {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
};

declare global {
    var mongooseCache: MongooseCache | undefined;
}

// Cache the connection on the global object so dev hot reloads reuse it.
const cached: MongooseCache = global.mongooseCache ?? { conn: null, promise: null };
global.mongooseCache = cached;

async function connectDB(): Promise<typeof mongoose> {
    if (cached.conn) return cached.conn;

    if (!cached.promise) {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGODB_URI is not set. Add it to .env.local.');

        cached.promise = mongoose.connect(uri, { bufferCommands: false });
    }

    try {
        cached.conn = await cached.promise;
    } catch (error) {
        // Reset so the next call can retry.
        cached.promise = null;
        throw error;
    }

    return cached.conn;
}

// Lets one-off scripts (sync, seed) exit cleanly.
export async function disconnectDB() {
    if (cached.conn) await cached.conn.disconnect();
    cached.conn = null;
    cached.promise = null;
}

export default connectDB;
