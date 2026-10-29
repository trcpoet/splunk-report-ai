import { reportsContext } from "@/lib/ai/context";
import { AiError, streamText } from "@/lib/ai/llm";
import { REPORTS_PROMPT } from "@/lib/ai/prompts";
import { encodeEvent, type StreamEvent } from "@/lib/ai/stream";
import { conversation, prepareTurn } from "@/lib/ai/turn";
import { recordTokens } from "@/lib/ai/usage";
import { saveTurn } from "@/lib/chats";

// An answer can take up to a minute on a slow day.
export const maxDuration = 60;

/**
 * POST /api/ai/chat  { chatId?, message }
 * Answers a question about the reports the signed-in person can see, streamed
 * as one JSON event per line (lib/ai/stream.ts). The question and answer are
 * saved together once the answer is complete; a stopped or failed answer
 * isn't saved.
 */
export async function POST(request: Request) {
    const turn = await prepareTurn(request, 'reports');
    if (turn instanceof Response) return turn;

    const { viewer, chatId, question } = turn;
    const system = `${REPORTS_PROMPT}\n\n${reportsContext(turn.reports, turn.sync)}`;

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            // After Stop or a closed tab nobody is listening, and that's fine.
            const send = (event: StreamEvent) => {
                try {
                    controller.enqueue(encodeEvent(event));
                } catch {
                    // The stream is already closed.
                }
            };

            send({ type: 'start', chatId });
            try {
                const answer = await streamText(
                    { system, turns: conversation(turn), thinking: 'low', signal: request.signal },
                    (text) => send({ type: 'text', text }),
                );
                const messageId = await saveTurn(viewer, { chatId, kind: 'reports', question, answer: { text: answer.text } });
                await recordTokens(viewer.id, answer.usage);

                send(messageId
                    ? { type: 'done', messageId, cutOff: answer.cutOff }
                    : { type: 'error', message: "This answer couldn't be saved because the chat is full. Start a new chat to keep going." });
            } catch (error) {
                if (!(error instanceof AiError)) console.error('Ask about reports failed:', error);
                send({ type: 'error', message: error instanceof AiError ? error.message : 'Something went wrong while answering. Try again.' });
            } finally {
                try {
                    controller.close();
                } catch {
                    // Already closed.
                }
            }
        },
    });

    return new Response(stream, {
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
    });
}
