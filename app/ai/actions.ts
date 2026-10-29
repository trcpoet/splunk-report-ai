'use server';

import { refresh } from "next/cache";
import { z } from "zod";
import { CHAT_ID, deleteChat, renameChat } from "@/lib/chats";

// Changes to saved chats, called from the History tab. Anyone can post to a
// Server Action, so each one checks its input here, and lib/chats.ts checks
// that the chat belongs to whoever is signed in (signed-out visitors go to
// /login). refresh() then redraws the list with the change.

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
