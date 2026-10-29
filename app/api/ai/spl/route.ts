import { splContext } from "@/lib/ai/context";
import { AiError, generateJson } from "@/lib/ai/llm";
import { SPL_PROMPT } from "@/lib/ai/prompts";
import { SplAnswerSchema, type StoredSplAnswer } from "@/lib/ai/spl";
import { conversation, jsonError, prepareTurn } from "@/lib/ai/turn";
import { recordTokens } from "@/lib/ai/usage";
import { saveTurn, type ChatMessage } from "@/lib/chats";
import { findSimilarExamples } from "@/lib/spl-examples";

export const maxDuration = 60;

/**
 * POST /api/ai/spl  { chatId?, message }
 * Writes or explains a Splunk search, using the indexes, fields and searches
 * of the reports the signed-in person can see, and the past searches most
 * like the request (lib/spl-examples.ts). Answers with
 * { chatId, message }, where message.spl holds the search step by step. The
 * app never runs the search.
 */
export async function POST(request: Request) {
    const turn = await prepareTurn(request, 'spl');
    if (turn instanceof Response) return turn;

    const { viewer, chatId, question } = turn;

    // The searches most like the request. For a follow-up such as "Only the last
    // 7 days", the request before it says more. Without them (the AI can't
    // compare right now), the prompt has every report's search instead.
    const lastAsked = turn.chat?.messages.findLast(({ role }) => role === 'user')?.text;
    const examples = await findSimilarExamples(viewer, lastAsked ? `${lastAsked}\n${question}` : question, turn.reports).catch((error) => {
        console.error("Couldn't find similar searches, so Write SPL shows the AI every report's search:", error);
        return undefined;
    });

    try {
        const { value: answer, usage } = await generateJson({
            system: `${SPL_PROMPT}\n\n${splContext(turn.reports, examples)}`,
            turns: conversation(turn),
            // Writing a correct search is worth a little more thinking than chat.
            thinking: 'medium',
            signal: request.signal,
            schema: SplAnswerSchema,
        });

        const spl: StoredSplAnswer = {
            ...answer,
            ...(examples && examples.length > 0 ? { basedOn: examples.map(({ title }) => title) } : {}),
        };

        const messageId = await saveTurn(viewer, { chatId, kind: 'spl', question, answer: { text: spl.summary, spl } });
        await recordTokens(viewer.id, usage);
        if (!messageId) return jsonError(409, "This search couldn't be saved because the chat is full. Start a new chat to keep going.");

        const message: ChatMessage = { id: messageId, role: 'assistant', text: spl.summary, spl, createdAt: new Date().toISOString() };
        return Response.json({ chatId, message });
    } catch (error) {
        if (error instanceof AiError) return jsonError(error.kind === 'busy' ? 503 : 502, error.message);
        console.error('Write SPL failed:', error);
        return jsonError(500, 'Something went wrong while writing the search. Try again.');
    }
}
