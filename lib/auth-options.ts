import { mongodbAdapter } from '@better-auth/mongo-adapter';
import type { BetterAuthOptions } from 'better-auth';
import { MongoClient } from 'mongodb';

// Better Auth settings shared by the web app (lib/auth.ts) and the demo-user
// seed script. No `server-only` or `next/*` imports, so plain Node can load it.

declare global {
    var authMongoClient: MongoClient | undefined;
}

function getClient() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set. Add it to .env.local.');

    // Reused across dev hot reloads. It connects on first use. In the web app it
    // gives up after 5 s, like the app's own connection (lib/mongodb.ts).
    global.authMongoClient ??= new MongoClient(uri, process.env.NEXT_RUNTIME ? { serverSelectionTimeoutMS: 5000 } : {});
    return global.authMongoClient;
}

export const authOptions = {
    appName: 'SplunkEvents',
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    // Pass only the Db. Passing the client as well turns on transactions, which
    // a standalone mongod (the local demo setup) doesn't support.
    database: mongodbAdapter(getClient().db()),
} satisfies BetterAuthOptions;

// Lets one-off scripts exit cleanly.
export async function closeAuthDatabase() {
    await global.authMongoClient?.close();
    global.authMongoClient = undefined;
}
