import 'server-only';
import { AiFeedback, AiSummary, type FeedbackKind, type FlagDetails, type Vote } from '@/database';
import type { Viewer } from '@/lib/access';
import { isOwnAnswer } from '@/lib/chats';
import { getVisibleReports } from '@/lib/dal';
import { findUnusualRun } from '@/lib/insights';
import connectDB from '@/lib/mongodb';

// 👍 / 👎 votes. Each person has one vote per thing; voting the same way again
// takes it back. Like lib/dal.ts, everything is scoped to the signed-in viewer.

export type { FeedbackKind, Vote };

export type VoteInput = {
    kind: FeedbackKind;
    targetId: string;
    // null takes the vote back.
    value: Vote | null;
};

type Target = { reportSlug?: string; flag?: FlagDetails };

// What a vote is about, worked out here from what the viewer can see, not
// taken from the page: an answer in one of their chats, a saved summary of a
// report they can see, or a flag the briefing shows them now. Null when
// there's no such thing.
async function findTarget(kind: FeedbackKind, targetId: string): Promise<Target | null> {
    if (kind === 'answer') return (await isOwnAnswer(targetId)) ? {} : null;

    const reports = await getVisibleReports();
    const visible = (slug: string) => reports.find((report) => report.slug === slug);

    if (kind === 'summary') {
        // "report:<slug>:…" (Explain) or "briefing:<hash>:…" (lib/ai/keys.ts).
        const slug = targetId.match(/^report:([a-z0-9-]+):/)?.[1];
        if (slug && !visible(slug)) return null;
        if (!(await AiSummary.exists({ _id: targetId }))) return null;
        return slug ? { reportSlug: slug } : {};
    }

    // A flag: "<slug>:<runAt>:<reason>" (flagId in lib/ai/keys.ts).
    const [, slug = '', runAt, reason] = targetId.match(/^([a-z0-9-]+):(.+):(status|unusual)$/) ?? [];
    const report = visible(slug);
    if (!report) return null;

    if (reason === 'status') {
        if (report.status === 'success' || report.lastRun !== runAt) return null;
        return { reportSlug: slug, flag: { reason, status: report.status, runAt } };
    }
    const unusual = findUnusualRun(report.history);
    if (unusual?.runAt !== runAt) return null;
    return { reportSlug: slug, flag: { reason: 'unusual', measure: unusual.measure, score: unusual.score, runAt } };
}

// Saves, changes or takes back the viewer's vote. False when there's nothing
// by that id for them to vote on.
export async function saveVote(viewer: Pick<Viewer, 'id'>, { kind, targetId, value }: VoteInput): Promise<boolean> {
    await connectDB();
    const filter = { userId: viewer.id, kind, targetId };

    // Taking a vote back only ever removes the viewer's own, so it needs no checks.
    if (value === null) {
        await AiFeedback.deleteOne(filter);
        return true;
    }

    const target = await findTarget(kind, targetId);
    if (!target) return false;
    await AiFeedback.updateOne(filter, { $set: { value, ...target } }, { upsert: true });
    return true;
}

// The viewer's votes on these things, by target id.
export async function getVotes(viewer: Pick<Viewer, 'id'>, kind: FeedbackKind, targetIds: string[]): Promise<Record<string, Vote>> {
    if (targetIds.length === 0) return {};

    await connectDB();
    const votes = await AiFeedback.find({ userId: viewer.id, kind, targetId: { $in: targetIds } }, { targetId: 1, value: 1 }).lean();
    return Object.fromEntries(votes.map(({ targetId, value }) => [targetId, value]));
}
