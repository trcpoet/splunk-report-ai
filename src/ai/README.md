# `src/ai/`: Ask AI, Write SPL, Explain and the briefing

- `llm.ts` is the only file that talks to the AI (Gemini). `AI_PROVIDER=fake` gives canned answers, for trying the pages without a key.
- `prompts.ts` has what the AI is told; `context.ts` turns reports into the text it reads. It only ever gets the reports the person may see.
- `turn.ts`, `stream.ts` and `usage.ts` handle a chat request: checks, streaming, daily limits.
- `spl.ts`, `validate.ts` and `retrieval.ts` are Write SPL: the answer's shape, the safety checks, and finding similar searches.
- `summaries.ts` and `keys.ts` write Explain's and the briefing's text once, save it, and share it.
- `chats.ts`, `feedback.ts` and `spl-examples.ts` keep chats, 👍 / 👎 votes and saved examples in MongoDB, each checking who is asking.
- `components/` has what you see: the chat (`ChatView.tsx`), the Explain panel (`ExplainButton.tsx`), the briefing.

**Open first:** `prompts.ts`, then `components/ExplainButton.tsx`.

**Tests:** the `*.test.ts` next to each file. **More:** [docs/reference/ai.md](../../docs/reference/ai.md) and [docs/ai.md](../../docs/ai.md).
