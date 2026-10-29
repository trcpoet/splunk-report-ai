import 'server-only';
import { z } from 'zod';
import type { Viewer } from '@/lib/access';
import { aiOffMessage, aiStatus } from '@/lib/ai/config';
import type { Turn as LlmTurn } from '@/lib/ai/llm';
import { queryFromSteps } from '@/lib/ai/spl';
import { countRequest } from '@/lib/ai/usage';
import { CHAT_ID, getChat, newChatId, turnsLeft, type ChatDetail, type ChatKind, type ChatMessage } from '@/lib/chats';
import { getSyncInfo, getViewerOrNull, getVisibleReportsWithResults } from '@/lib/dal';
import type { SplunkReport, SyncInfo } from '@/lib/reports';

// The checks both chat routes (/api/ai/chat and /api/ai/spl) run before asking
// the AI, in order: signed in, a valid question, AI turned on, a chat that is
// theirs and has room, and today's limit. Each failure is a JSON answer the
// page shows as it is. The reports are loaded last, only for requests that pass.

const Body = z.object({
    chatId: z.string().regex(CHAT_ID).optional(),
    message: z.string().trim().min(1).max(2000),
});

export type ReadyTurn = {
    viewer: Viewer;
    // The chat to add to: the existing one, or a new id.
    chatId: string;
    chat: ChatDetail | null;
    question: string;
    reports: SplunkReport[];
    sync: SyncInfo | null;
};

export const jsonError = (status: number, message: string) => Response.json({ message }, { status });

export async function prepareTurn(request: Request, kind: ChatKind): Promise<ReadyTurn | Response> {
    const viewer = await getViewerOrNull();
    if (!viewer) return jsonError(401, 'Sign in to ask the AI.');

    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) return jsonError(400, 'Send a question of 1 to 2,000 characters.');
    const { chatId, message } = body.data;

    const [sync, chat] = await Promise.all([getSyncInfo(), chatId ? getChat(chatId) : null]);

    const status = aiStatus(sync?.mode);
    if (!status.enabled) return jsonError(503, aiOffMessage(status.reason));

    // Someone else's chat gets the same answer as a missing one.
    if (chatId && (!chat || chat.kind !== kind)) return jsonError(404, 'Chat not found. It may have been deleted.');
    if (turnsLeft(chat) < 1) return jsonError(409, 'This chat is full. Start a new chat to keep going.');

    const limited = await countRequest(viewer.id);
    if (limited) return jsonError(429, limited);

    const reports = await getVisibleReportsWithResults();
    return { viewer, chatId: chat?.id ?? newChatId(), chat, question: message, reports, sync };
}

// The chat so far, as the AI sees it, ending with the new question. A Write
// SPL answer goes back as its summary and search, so a follow-up such as
// "only the last hour" can change the search.
export function conversation({ chat, question }: Pick<ReadyTurn, 'chat' | 'question'>): LlmTurn[] {
    const earlier = (chat?.messages ?? []).map(({ role, text, spl }: ChatMessage): LlmTurn => ({
        role,
        text: spl ? `${spl.summary}\n\nSearch:\n${queryFromSteps(spl.steps)}` : text,
    }));
    return [...earlier, { role: 'user', text: question }];
}
