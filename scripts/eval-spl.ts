// npm run eval:spl: scores Write SPL on the requests in scripts/spl-eval-set.json,
// with the same steps as the tab: the closest example searches (RAG), the
// prompt, the AI, and the SPL check. It uses the demo reports, so it needs
// no database. Run it with a real GEMINI_API_KEY to measure a change to the
// prompt, the examples or the model; AI_PROVIDER=fake only exercises it.
import { readFileSync } from 'node:fs';
import { splContext } from '@/lib/ai/context';
import { embed, generateJson } from '@/lib/ai/llm';
import { SPL_PROMPT } from '@/lib/ai/prompts';
import { exampleText, reportExample, topK } from '@/lib/ai/retrieval';
import { checkSpl, pipeCommands, queryFromSteps, SplAnswerSchema } from '@/lib/ai/spl';
import { validateSpl } from '@/lib/ai/validate';
import { aiModel, embeddingModel } from '@/lib/ai/config';
import type { SplunkReport } from '@/lib/reports';
import { reports as fixtures } from '@/lib/splunk/fixtures/reports';

type Case = { request: string; indexes: string[]; fields: string[]; commands?: string[] };

async function main() {
    if (!process.env.GEMINI_API_KEY && process.env.AI_PROVIDER !== 'fake') {
        console.error('Set GEMINI_API_KEY (in .env.local) to score Write SPL, or AI_PROVIDER=fake to try the script.');
        process.exitCode = 1;
        return;
    }
    const { cases } = JSON.parse(readFileSync(new URL('./spl-eval-set.json', import.meta.url), 'utf8')) as { cases: Case[] };
    const reports: SplunkReport[] = fixtures.map((fixture) => ({ ...fixture, chart: null, resultsRunAt: fixture.lastRun }));
    const examples = reports.map(reportExample);
    const vectors = await embed(examples.map((example) => ({ title: example.title, text: exampleText(example) })), 'document');

    console.log(`Write SPL with ${process.env.AI_PROVIDER === 'fake' ? 'test-mode answers' : `${aiModel()} and ${embeddingModel()}`}, ${cases.length} requests.\n`);
    let total = 0;
    for (const { request, indexes, fields, commands } of cases) {
        const [query] = await embed([{ text: request }], 'query');
        const closest = topK(query, examples.map((item, i) => ({ item, vector: vectors[i] })), 5);
        const { value } = await generateJson({
            system: `${SPL_PROMPT}\n\n${splContext(reports, closest)}`,
            turns: [{ role: 'user', text: request }],
            thinking: 'medium',
            schema: SplAnswerSchema,
        });
        const spl = queryFromSteps(value.steps);
        const used = new Set([...pipeCommands(spl), ...(spl.trim().startsWith('|') ? [] : ['search'])]);

        const checks = {
            parses: validateSpl(spl).ok,
            'read-only': checkSpl(spl).readOnly,
            index: indexes.some((index) => new RegExp(`index\\s*=\\s*"?${index}\\b`, 'i').test(spl)),
            fields: fields.every((field) => spl.toLowerCase().includes(field.toLowerCase())),
            ...(commands ? { command: commands.some((command) => used.has(command)) } : {}),
        };
        const passed = Object.values(checks).filter(Boolean).length;
        const score = passed / Object.keys(checks).length;
        total += score;

        const missed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
        console.log(`${(score * 100).toFixed(0).padStart(4)}%  ${request}${missed.length > 0 ? `  (missed: ${missed.join(', ')})` : ''}`);
    }
    console.log(`\nScore: ${((total / cases.length) * 100).toFixed(0)}% across ${cases.length} requests.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
