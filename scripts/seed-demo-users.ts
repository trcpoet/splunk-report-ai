import { betterAuth } from 'better-auth';
import { UserAccess } from '@/database';
import { authOptions, closeAuthDatabase } from '@/lib/auth-options';
import { DEMO_USERS } from '@/lib/demo-users';
import connectDB, { disconnectDB } from '@/lib/mongodb';

// Creates the demo users and their report access (npm run seed). Safe to run
// again: existing users keep their password, and their access is updated.
//
// The web app turns sign-up off, and Better Auth enforces that inside the
// sign-up endpoint itself, so this script uses its own instance with sign-up on.

async function main() {
    const password = process.env.DEMO_PASSWORD;
    if (!password || password.length < 8) throw new Error('Set DEMO_PASSWORD (at least 8 characters) in .env.local.');

    const seedAuth = betterAuth({ ...authOptions, emailAndPassword: { enabled: true, autoSignIn: false } });
    const { internalAdapter } = await seedAuth.$context;
    await connectDB();

    for (const user of DEMO_USERS) {
        // Look first: for an existing email, sign-up answers with a generic
        // success (so it can't be used to discover accounts) instead of an error.
        const created = !(await internalAdapter.findUserByEmail(user.email));
        if (created) await seedAuth.api.signUpEmail({ body: { email: user.email, password, name: user.name } });

        await UserAccess.updateOne(
            { email: user.email },
            { $set: { role: user.role, groups: user.groups, source: 'seed' } },
            { upsert: true },
        );

        const access = user.role === 'admin' ? 'admin, sees every report' : `groups: ${user.groups.join(', ')}`;
        console.log(`${created ? 'Created' : 'Exists '}  ${user.email.padEnd(28)} ${access}`);
    }

    console.log('\nSign in at /login with any of these emails and the DEMO_PASSWORD from .env.local.');
}

main()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(() => Promise.all([disconnectDB(), closeAuthDatabase()]));
