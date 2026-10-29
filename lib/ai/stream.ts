// How a streamed AI answer travels to the browser: one JSON object per line
// (NDJSON). The route handler writes these events and the page reads them:
//
//   {"type":"start","chatId":"…"}                 the chat this answer belongs to
//   {"type":"text","text":"…"}                    the next piece of the answer
//   {"type":"done","messageId":"…","cutOff":false} saved, and complete
//   {"type":"error","message":"…"}                failed; nothing follows
//
// A plain text stream couldn't tell the page that something failed halfway.

export type StreamEvent =
    | { type: 'start'; chatId: string }
    | { type: 'text'; text: string }
    | { type: 'done'; messageId: string; cutOff: boolean }
    | { type: 'error'; message: string };

const encoder = new TextEncoder();

export const encodeEvent = (event: StreamEvent) => encoder.encode(`${JSON.stringify(event)}\n`);

// Calls onEvent for every event in the response body, in order.
export async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (event: StreamEvent) => void) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;

        // stream: true keeps a character split across two reads in one piece.
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // The last piece may be half a line; keep it for the next read.
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (line.trim()) onEvent(JSON.parse(line) as StreamEvent);
        }
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer) as StreamEvent);
}
