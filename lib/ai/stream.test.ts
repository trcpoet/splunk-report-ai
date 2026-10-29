import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { encodeEvent, readEvents, type StreamEvent } from '@/lib/ai/stream';

// A response body that arrives in the given pieces, as a network would split it.
const bodyFrom = (pieces: Uint8Array[]) => new ReadableStream<Uint8Array>({
    start(controller) {
        for (const piece of pieces) controller.enqueue(piece);
        controller.close();
    },
});

const join = (parts: Uint8Array[]) => {
    const all = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
    let at = 0;
    for (const part of parts) {
        all.set(part, at);
        at += part.length;
    }
    return all;
};

describe('readEvents', () => {
    const events: StreamEvent[] = [
        { type: 'start', chatId: '0123456789abcdef01234567' },
        { type: 'text', text: 'Disk space is at 97% – the “/var” mount 🙂' },
        { type: 'done', messageId: '76543210fedcba9876543210', cutOff: false },
    ];

    test('reads every event in order', async () => {
        const seen: StreamEvent[] = [];
        await readEvents(bodyFrom(events.map(encodeEvent)), (event) => seen.push(event));
        assert.deepEqual(seen, events);
    });

    test('copes with lines and characters split between pieces', async () => {
        const bytes = join(events.map(encodeEvent));
        // Three-byte pieces cut through lines and through multi-byte characters.
        const pieces = Array.from({ length: Math.ceil(bytes.length / 3) }, (_, i) => bytes.slice(i * 3, i * 3 + 3));

        const seen: StreamEvent[] = [];
        await readEvents(bodyFrom(pieces), (event) => seen.push(event));
        assert.deepEqual(seen, events);
    });
});
