import 'server-only';
import { createHash } from 'node:crypto';
import { connection } from 'next/server';
import { AiEmbedding, Chat, SavedSplExample, type IChat } from '@/database';
import { canView, type Viewer } from '@/lib/access';
import { embed, EMBEDDING_DIMENSIONS, embeddingModelInUse, type EmbedInput } from '@/lib/ai/llm';
import { exampleText, reportExample, savedExample, topK, type SplExample } from '@/lib/ai/retrieval';
import { checkSpl, queryFromSteps } from '@/lib/ai/spl';
import { CHAT_ID } from '@/lib/chats';
import connectDB from '@/lib/mongodb';
import type { SplunkReport } from '@/lib/reports';

// Write SPL's examples: the searches it shows the AI for each request (RAG).
// They're the person's own reports, plus searches people saved from Write SPL
// as good examples. The closest ones to the request go into the prompt
// (lib/ai/context.ts), so answers follow the team's searches and field names.
// Like lib/dal.ts, everything here is scoped to who is asking.

// How many examples go into the prompt.
export const SIMILAR_EXAMPLES = 5;

// The newest saved searches considered for each request.
const MAX_SAVED = 500;

// Vectors for documents, saved so each text is embedded once. Requests are
// embedded fresh each time: they're rarely asked twice.
async function embedDocuments(inputs: EmbedInput[]): Promise<number[][]> {
    const model = embeddingModelInUse();
    const keys = inputs.map(({ text, title }) =>
        createHash('sha256').update(`${model}|${EMBEDDING_DIMENSIONS}|document|${title ?? ''}|${text}`).digest('hex'));

    const saved = new Map((await AiEmbedding.find({ _id: { $in: keys } }, { vector: 1 }).lean()).map(({ _id, vector }) => [_id, vector]));
    const missing = inputs.map((input, i) => ({ input, key: keys[i] })).filter(({ key }) => !saved.has(key));

    if (missing.length > 0) {
        const vectors = await embed(missing.map(({ input }) => input), 'document');
        await AiEmbedding.bulkWrite(missing.map(({ key }, i) => ({
            updateOne: { filter: { _id: key }, update: { $set: { vector: vectors[i], model, createdAt: new Date() } }, upsert: true },
        })));
        missing.forEach(({ key }, i) => saved.set(key, vectors[i]));
    }
    return keys.map((key) => saved.get(key) ?? []);
}

// Saved searches shared with one of the viewer's groups (admins see them all).
async function visibleSaved(viewer: Viewer): Promise<SplExample[]> {
    const docs = await SavedSplExample.find({}).sort({ createdAt: -1 }).limit(MAX_SAVED).lean();
    return docs
        .filter(({ allowedGroups }) => canView(viewer, allowedGroups))
        .map(({ _id, request, summary, query }) => savedExample({ id: _id, request, summary, query }));
}

// The examples most like the request, closest first. Throws when the AI can't
// embed right now; the caller then writes the prompt without them.
export async function findSimilarExamples(viewer: Viewer, request: string, reports: SplunkReport[]): Promise<SplExample[]> {
    await connectDB();
    const candidates = [...reports.map(reportExample), ...(await visibleSaved(viewer))];
    if (candidates.length === 0) return [];

    const [[query], vectors] = await Promise.all([
        embed([{ text: request }], 'query'),
        embedDocuments(candidates.map((example) => ({ title: example.title, text: exampleText(example) }))),
    ]);
    return topK(query, candidates.map((item, i) => ({ item, vector: vectors[i] })), SIMILAR_EXAMPLES);
}

// Saves a Write SPL answer from one of the viewer's own chats as an example.
// The search comes from the stored answer, not from the page. Only searches
// that only read data, and that parse, make good examples.
export async function saveExample(viewer: Viewer, messageId: string): Promise<boolean> {
    if (!CHAT_ID.test(messageId)) return false;
    await connectDB();

    const chat = await Chat.findOne({ userId: viewer.id, kind: 'spl', 'messages._id': messageId }).lean<IChat>();
    if (!chat) return false;
    const at = chat.messages.findIndex(({ _id }) => String(_id) === messageId);
    const answer = chat.messages[at];
    const question = chat.messages.slice(0, at).findLast(({ role }) => role === 'user');
    if (answer?.role !== 'assistant' || !answer.spl || !question) return false;

    const query = queryFromSteps(answer.spl.steps);
    if (!checkSpl(query).readOnly || answer.spl.validation?.ok === false) return false;

    await SavedSplExample.updateOne(
        { _id: messageId },
        { $set: { request: question.text, summary: answer.spl.summary, query, allowedGroups: viewer.groups, savedBy: viewer.id, createdAt: new Date() } },
        { upsert: true },
    );
    return true;
}

// Takes back one of the viewer's own saved examples.
export async function removeExample(viewer: Viewer, messageId: string): Promise<boolean> {
    if (!CHAT_ID.test(messageId)) return false;
    await connectDB();
    await SavedSplExample.deleteOne({ _id: messageId, savedBy: viewer.id });
    return true;
}

// Which of these answers the viewer saved as examples. Read for each request
// (connection()), like votes, so it's never in a prerendered page shell.
export async function savedExampleIds(viewer: Viewer, messageIds: string[]): Promise<Record<string, true>> {
    if (messageIds.length === 0) return {};
    await connection();
    await connectDB();
    const docs = await SavedSplExample.find({ _id: { $in: messageIds }, savedBy: viewer.id }, { _id: 1 }).lean();
    return Object.fromEntries(docs.map(({ _id }) => [_id, true as const]));
}
