'use server';

import { refresh } from "next/cache";
import { z } from "zod";
import { CHAT_ID, deleteChat, renameChat } from "@/lib/chats";
import { getViewer } from "@/lib/dal";
import { saveVote, type VoteInput } from "@/lib/feedback";
import { removeExample, saveExample } from "@/lib/spl-examples";

// Changes to saved chats (from the sidebar and the chats page) and 👍 / 👎
// votes. Anyone can post to a Server Action, so each one checks its input
// here, and lib/chats.ts checks that the chat belongs to whoever is signed in
// (signed-out visitors go to /login). refresh() then redraws the lists with
// the change.

type Result = { ok: true } | { ok: false; message: string };

const ChatId = z.string().regex(CHAT_ID);
const NOT_FOUND: Result = { ok: false, message: 'Chat not found. It may have been deleted.' };

export async function renameChatAction(id: string, title: string): Promise<Result> {
    const input = z.object({ id: ChatId, title: z.string().trim().min(1).max(80) }).safeParse({ id, title });
    if (!input.success) return { ok: false, message: 'Give the chat a name of 1 to 80 characters.' };

    const renamed = await renameChat(input.data.id, input.data.title);
    refresh();
    return renamed ? { ok: true } : NOT_FOUND;
}

export async function deleteChatAction(id: string): Promise<Result> {
    const input = ChatId.safeParse(id);
    if (!input.success) return NOT_FOUND;

    const deleted = await deleteChat(input.data);
    refresh();
    return deleted ? { ok: true } : NOT_FOUND;
}

const VoteSchema = z.object({
    kind: z.enum(['answer', 'summary', 'flag']),
    targetId: z.string().min(1).max(200),
    value: z.enum(['up', 'down']).nullable(),
});

// Saves, changes or takes back the viewer's vote. lib/feedback.ts checks that
// it's about something they were shown, and works out what that was. It
// doesn't redraw the page: the buttons already show the vote, and a chat on
// screen must not reset.
export async function voteAction(input: VoteInput): Promise<Result> {
    const vote = VoteSchema.safeParse(input);
    if (!vote.success) return { ok: false, message: "That vote couldn't be saved." };

    const saved = await saveVote(await getViewer(), vote.data);
    return saved ? { ok: true } : { ok: false, message: "That vote couldn't be saved." };
}

// Saves a Write SPL answer as an example for later requests, or takes it back.
// lib/spl-examples.ts checks that the answer is in one of the viewer's chats.
export async function saveExampleAction(messageId: string, save: boolean): Promise<Result> {
    const input = ChatId.safeParse(messageId);
    if (!input.success) return { ok: false, message: "That search couldn't be saved." };

    const viewer = await getViewer();
    const done = save ? await saveExample(viewer, input.data) : await removeExample(viewer, input.data);
    return done ? { ok: true } : { ok: false, message: "Only searches that only read data, and that parse, can be examples." };
}
