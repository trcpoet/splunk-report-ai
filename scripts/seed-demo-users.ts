import { betterAuth } from 'better-auth';
import { UserAccess } from '@/database';
import { authOptions, closeAuthDatabase } from '@/lib/auth-options';
import { DEMO_USERS } from '@/lib/demo-users';
import connectDB, { disconnectDB } from '@/lib/mongodb';

// Creates the demo users and their report access (npm run seed). Safe to run
// again: existing demo users get the current DEMO_PASSWORD and access, so
// changing DEMO_PASSWORD in .env.local and re-running this takes effect.
//
// The web app turns sign-up off, and Better Auth enforces that inside the
// sign-up endpoint itself, so this script uses its own instance with sign-up on.

async function main() {
    const password = process.env.DEMO_PASSWORD;
    if (!password || password.length < 8) throw new Error('Set DEMO_PASSWORD (at least 8 characters) in .env.local.');

    const seedAuth = betterAuth({ ...authOptions, emailAndPassword: { enabled: true, autoSignIn: false } });
    const { internalAdapter, password: hasher } = await seedAuth.$context;
    await connectDB();

    for (const user of DEMO_USERS) {
        // Look first: for an existing email, sign-up answers with a generic
        // success (so it can't be used to discover accounts) instead of an error.
        const existing = await internalAdapter.findUserByEmail(user.email);
        const created = !existing;

        if (existing) await internalAdapter.updatePassword(existing.user.id, await hasher.hash(password));
        else await seedAuth.api.signUpEmail({ body: { email: user.email, password, name: user.name } });

        await UserAccess.updateOne(
            { email: user.email },
            { $set: { role: user.role, groups: user.groups, source: 'seed' } },
            { upsert: true },
        );

        const access = user.role === 'admin' ? 'admin, sees every report' : `groups: ${user.groups.join(', ')}`;
        console.log(`${created ? 'Created' : 'Updated'}  ${user.email.padEnd(28)} ${access}`);
    }

    console.log('\nSign in at /login with any of these emails. The password is the value of DEMO_PASSWORD');
    console.log('in .env.local (see it with: grep DEMO_PASSWORD .env.local).');
}

main()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(() => Promise.all([disconnectDB(), closeAuthDatabase()]));
