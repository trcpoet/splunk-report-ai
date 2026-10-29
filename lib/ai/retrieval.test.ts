import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cosine, exampleText, hashedEmbedding, reportExample, savedExample, topK } from '@/lib/ai/retrieval';
import { reports as fixtures } from '@/lib/splunk/fixtures/reports';

describe('cosine and topK', () => {
    test('scores the same direction 1 and unrelated directions 0', () => {
        assert.equal(cosine([1, 2, 3], [2, 4, 6]), 1);
        assert.equal(cosine([1, 0], [0, 1]), 0);
        assert.equal(cosine([0, 0], [1, 1]), 0);
    });

    test('returns the closest candidates first, at most k', () => {
        const candidates = [
            { item: 'far', vector: [0, 1] },
            { item: 'closest', vector: [1, 0.05] },
            { item: 'close', vector: [1, 0.5] },
        ];
        assert.deepEqual(topK([1, 0], candidates, 2), ['closest', 'close']);
    });
});

describe('hashedEmbedding (the test stand-in for real embeddings)', () => {
    test('gives the same vector for the same text, and closer vectors for shared words', () => {
        assert.deepEqual(hashedEmbedding('failed logins by user'), hashedEmbedding('failed logins by user'));
        const request = hashedEmbedding('count failed logins per user');
        assert.ok(cosine(request, hashedEmbedding('failed logins by user and source')) > cosine(request, hashedEmbedding('disk space by host')));
    });
});

describe('examples', () => {
    test('a report becomes an example with its index, columns and search', () => {
        const report = fixtures.find(({ slug }) => slug === 'failed-logins-by-user')!;
        const example = reportExample(report);
        assert.equal(example.id, 'report:failed-logins-by-user');
        assert.equal(example.source, 'report');
        const text = exampleText(example);
        assert.ok(text.includes('Index: wineventlog, linux_secure') && text.includes('Columns: User, Failures') && text.includes('| stats count AS failures'));
    });

    test('a saved search keeps the request it answered as its title', () => {
        const example = savedExample({ id: 'abc', request: 'Failed logins per host', summary: 'Counts failures per host.', query: 'index=wineventlog | stats count BY host' });
        assert.deepEqual([example.id, example.source, example.title], ['saved:abc', 'saved', 'Failed logins per host']);
        assert.equal(exampleText(example), 'Counts failures per host.\nindex=wineventlog | stats count BY host');
    });

    test('finds the report most like a request, with the stand-in embeddings', () => {
        const examples = fixtures.map(reportExample);
        const vectors = examples.map((example) => hashedEmbedding(`${example.title} ${exampleText(example)}`));
        const [closest] = topK(hashedEmbedding('which hosts have disk space above 85%'), examples.map((item, i) => ({ item, vector: vectors[i] })), 1);
        assert.equal(closest.id, 'report:disk-space-over-85');
    });
});
