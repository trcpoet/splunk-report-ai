import 'server-only';
import { AiFeedback, type FeedbackKind, type FlagDetails, type Vote } from '@/database';
import type { Viewer } from '@/lib/access';
import connectDB from '@/lib/mongodb';

// 👍 / 👎 votes. Each person has one vote per thing; voting the same way again
// takes it back. Like lib/dal.ts, everything is scoped to the signed-in viewer.

export type { FeedbackKind, Vote };

export type VoteInput = {
    kind: FeedbackKind;
    targetId: string;
    // null takes the vote back.
    value: Vote | null;
    reportSlug?: string;
    flag?: FlagDetails;
};

export async function saveVote(viewer: Pick<Viewer, 'id'>, { kind, targetId, value, reportSlug, flag }: VoteInput) {
    await connectDB();
    const filter = { userId: viewer.id, kind, targetId };

    if (value === null) {
        await AiFeedback.deleteOne(filter);
        return;
    }
    await AiFeedback.updateOne(filter, { $set: { value, reportSlug, flag } }, { upsert: true });
}

// The viewer's votes on these things, by target id.
export async function getVotes(viewer: Pick<Viewer, 'id'>, kind: FeedbackKind, targetIds: string[]): Promise<Record<string, Vote>> {
    if (targetIds.length === 0) return {};

    await connectDB();
    const votes = await AiFeedback.find({ userId: viewer.id, kind, targetId: { $in: targetIds } }, { targetId: 1, value: 1 }).lean();
    return Object.fromEntries(votes.map(({ targetId, value }) => [targetId, value]));
}
