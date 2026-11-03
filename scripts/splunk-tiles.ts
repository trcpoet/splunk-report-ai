import { describeError } from '@/splunk/errors';
import { readSyncSettings, transportFor } from '@/splunk/settings';
import { draftCard, findDashboard, iconNote, inputsOf, tilesOf } from '@/splunk/tiles';

// npm run splunk:tiles "<dashboard name or label>": a worksheet for moving a
// Splunk dashboard's tiles into the app, one entry per tile: its whole search,
// its time range and thresholds, and a draft card for config/report-cards.yaml.
// It reads the dashboard with the sync's own settings and token, and writes
// nothing. Save the output: npm run --silent splunk:tiles "<name>" > tiles.md

async function main() {
    const wanted = process.argv.slice(2).join(' ').trim();
    if (!wanted) {
        console.log('Usage: npm run --silent splunk:tiles "<dashboard name or label>" > tiles.md');
        process.exitCode = 1;
        return;
    }

    const settings = readSyncSettings();
    if (settings.mode !== 'live') {
        console.log('splunk:tiles reads a real dashboard: set SPLUNK_MODE=live, SPLUNK_BASE_URL and the token (npm run splunk:check tests them).');
        process.exitCode = 1;
        return;
    }

    const { dashboard, count } = await findDashboard(transportFor(settings), wanted);
    if (!dashboard) {
        console.log(`No dashboard called "${wanted}" among the ${count} the token can read. Use its name from its address in Splunk (…/app/<app>/<name>) or its title.`);
        process.exitCode = 1;
        return;
    }

    const tiles = tilesOf(dashboard.content['eai:data'] ?? '');
    const lines = [
        `# Tiles from "${dashboard.content.label ?? dashboard.name}" (${dashboard.acl?.app ?? 'search'}/${dashboard.name})`,
        '',
        `${tiles.length} tiles. For each one:`,
        '1. In Splunk, save its search as a report, schedule it, and share it with the service account\'s role. Skip this for a tile that already shows a report.',
        '2. Copy its draft card into config/report-cards.yaml, and fix what\'s marked to check: the column names, the category, who sees it.',
        '3. Once the report has run: npm run card:preview "<the report\'s name>", which lists its real columns. Then npm run check and npm run sync.',
        '',
        'docs/adding-report-cards.md explains every part of a card.',
    ];
    tiles.forEach((tile, index) => {
        const time = tile.earliest || tile.latest ? ` (time range: ${tile.earliest ?? '…'} to ${tile.latest ?? 'now'})` : '';
        lines.push('', `## ${index + 1}. ${tile.title} (${tile.kind}${tile.chart ? `, ${tile.chart}` : ''})`, '');
        if (tile.savedSearch) lines.push(`- **Already a report:** "${tile.savedSearch}". Its card goes under that name.`);
        if (tile.search) lines.push(`- **Search**${time}:`, '', '```spl', tile.search, '```', '');
        const inputs = inputsOf(tile.search);
        if (inputs.length > 0) lines.push(`- **Uses dashboard inputs** (${inputs.join(', ')}): a scheduled report has none, so put fixed values in their place first.`);
        if (tile.thresholds.length > 0) lines.push(`- **Colors:** ${tile.colors.join(', ') || 'set'} around ${tile.thresholds.join(', ')}. Check which way is bad; the draft guesses from the colors.`);
        if (tile.unit || tile.decimals !== undefined) lines.push(`- **Shows:** ${[tile.decimals !== undefined ? `${tile.decimals} decimals` : '', tile.unit ? `the unit "${tile.unit}"` : ''].filter(Boolean).join(', ')}.`);
        lines.push(`- **Icon:** ${iconNote(tile.title)}`);
        lines.push('- **Draft card** (check the column names once the report has run):', '', '```yaml', draftCard(tile).trimEnd(), '```');
    });
    console.log(lines.join('\n'));
}

main().catch((error: unknown) => {
    console.error(describeError(error));
    process.exitCode = 1;
});
