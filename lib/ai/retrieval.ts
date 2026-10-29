import type { SplunkReport } from '@/lib/reports';

// Finding the past searches most like a Write SPL request (RAG: retrieval-
// augmented generation). Each search becomes a vector (an embedding, from
// lib/ai/llm.ts) and the request's closest vectors win, so the AI writes from
// the team's own searches and field names. Pure, so it's tested without an AI.

// A search the AI can learn from: one of the person's reports, or a search
// someone saved as a good example from Write SPL (lib/spl-examples.ts).
export type SplExample = {
    // 'report:<slug>' or 'saved:<message id>'.
    id: string;
    source: 'report' | 'saved';
    // The report's title, or the request the saved search answered.
    title: string;
    description: string;
    index?: string;
    columns?: string[];
    spl: string;
};

export const reportExample = ({ slug, title, description, index, columns, spl }: Pick<SplunkReport, 'slug' | 'title' | 'description' | 'index' | 'columns' | 'spl'>): SplExample => ({
    id: `report:${slug}`,
    source: 'report',
    title,
    description,
    index,
    columns,
    spl,
});

export const savedExample = ({ id, request, summary, query }: { id: string; request: string; summary: string; query: string }): SplExample => ({
    id: `saved:${id}`,
    source: 'saved',
    title: request,
    description: summary,
    spl: query,
});

// What a request is compared with: everything that says what the search is for.
export const exampleText = ({ description, index, columns, spl }: SplExample) =>
    [description, index && `Index: ${index}`, columns && columns.length > 0 && `Columns: ${columns.join(', ')}`, spl].filter(Boolean).join('\n');

// How alike two vectors are, from -1 to 1 (1 is the same direction).
export function cosine(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

// The k candidates closest to the query, closest first.
export const topK = <T>(query: number[], candidates: { item: T; vector: number[] }[], k: number): T[] =>
    candidates
        .map(({ item, vector }) => ({ item, score: cosine(query, vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .map(({ item }) => item);

// A stand-in for real embeddings (AI_PROVIDER=fake and the tests): words are
// hashed into a fixed number of buckets, so texts that share words point the
// same way. Same text, same vector.
export function hashedEmbedding(text: string, dimensions = 256): number[] {
    const vector = new Array<number>(dimensions).fill(0);
    for (const word of text.toLowerCase().match(/[a-z0-9_]+/g) ?? []) {
        let hash = 2166136261;
        for (let i = 0; i < word.length; i++) hash = Math.imul(hash ^ word.charCodeAt(i), 16777619);
        vector[(hash >>> 0) % dimensions] += 1;
    }
    return vector;
}
