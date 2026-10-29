import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ChatSummary } from '@/lib/chats';
import { mergeChats } from '@/lib/chat-list';

const chat = (id: string, updatedAt: string, more: Partial<ChatSummary> = {}): ChatSummary => ({
    id,
    kind: 'reports',
    title: `Chat ${id}`,
    updatedAt,
    preview: `Preview ${id}`,
    group: 'Older',
    ...more,
});

describe('mergeChats', () => {
    test('adds a chat saved since the page loaded, at the top of today', () => {
        const merged = mergeChats(
            [chat('a', '2026-10-20T10:00:00.000Z')],
            [{ id: 'b', kind: 'spl', title: 'Failed logins by IP', updatedAt: '2026-10-29T15:00:00.000Z' }],
        );

        assert.deepEqual(merged.map(({ id }) => id), ['b', 'a']);
        assert.deepEqual(merged[0], {
            id: 'b',
            kind: 'spl',
            title: 'Failed logins by IP',
            updatedAt: '2026-10-29T15:00:00.000Z',
            preview: '',
            group: 'Today',
        });
    });

    test('moves a chat with a newer answer to the top, keeping the server title', () => {
        const merged = mergeChats(
            [chat('a', '2026-10-29T09:00:00.000Z', { group: 'Today' }), chat('b', '2026-10-28T09:00:00.000Z', { title: 'Renamed', group: 'Yesterday' })],
            [{ id: 'b', kind: 'reports', title: 'Old title', updatedAt: '2026-10-29T12:00:00.000Z' }],
        );

        assert.deepEqual(merged.map(({ id }) => id), ['b', 'a']);
        assert.equal(merged[0].title, 'Renamed');
        assert.equal(merged[0].group, 'Today');
        assert.equal(merged[0].preview, 'Preview b');
    });

    test('keeps the server copy when it is as new as the saved one, or newer', () => {
        const server = [chat('a', '2026-10-29T12:00:00.000Z', { title: 'Renamed', group: 'Today' })];
        const merged = mergeChats(server, [{ id: 'a', kind: 'reports', title: 'Old title', updatedAt: '2026-10-29T11:00:00.000Z' }]);

        assert.deepEqual(merged, server);
    });

    test('returns the server list as it is when nothing was saved', () => {
        const server = [chat('a', '2026-10-29T12:00:00.000Z'), chat('b', '2026-10-28T12:00:00.000Z')];

        assert.deepEqual(mergeChats(server, []), server);
    });
});
