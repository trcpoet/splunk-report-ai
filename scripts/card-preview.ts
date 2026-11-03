import { formatCell, formatDateTime, formatNumber } from '@/shared/format';
import { describeError } from '@/splunk/errors';
import { findReport, previewReport } from '@/splunk/preview';
import { readSyncSettings, transportFor } from '@/splunk/settings';

// npm run card:preview "<report name or slug>": shows a report's card and page
// as the app will, from its newest finished run in Splunk (or the dummy data,
// with SPLUNK_MODE=fixture). It only reads. Exit code 1 if the card names a
// column the results don't have, or there's no run to show.

const ROWS_SHOWN = 5;

async function main() {
    const wanted = process.argv.slice(2).join(' ').trim();
    if (!wanted) {
        console.log('Usage: npm run card:preview "<report name or slug>"');
        process.exitCode = 1;
        return;
    }

    const settings = readSyncSettings();
    const transport = transportFor(settings);
    const { report, names } = await findReport(transport, wanted, settings);
    if (!report) {
        console.log(`✗ The sync takes no report called "${wanted}" (SYNC_REPORTS=${settings.syncReports}). It takes:\n${names.map((name) => `  - ${name}`).join('\n')}`);
        process.exitCode = 1;
        return;
    }

    const { hasCard, run, derived, unknownColumns } = await previewReport(transport, report);
    console.log(`${report.entry.name}  (/reports/${report.meta.slug})`);
    console.log(hasCard ? '  Card: config/report-cards.yaml' : '  No card in config/report-cards.yaml yet: the defaults apply, and only admins see it.');
    console.log(`  ${report.meta.schedule}, ${report.meta.timeRange.toLowerCase()}`);

    if (!run || !derived) {
        console.log('\n✗ No finished run with results yet. Splunk runs the report on its schedule; try again after the next run.');
        process.exitCode = 1;
        return;
    }

    console.log(`\nNewest run: ${formatDateTime(run.runAt.toISOString())}, ${formatNumber(run.resultCount)} results`);
    console.log(`Columns: ${run.columns.join(', ')}`);
    console.log(`Status: ${run.status === 'success' ? 'Healthy' : run.status === 'warning' ? 'Warning' : 'Failed'}${run.statusMessage ? `: ${run.statusMessage}` : ''}`);

    console.log('\nHeadline numbers (the first is on the card):');
    for (const { label, value, note, meter } of derived.highlights) {
        console.log(`  ${label}: ${value}${note ? `  (${note})` : ''}${meter !== undefined ? `  [meter ${Math.round(meter * 100)}%]` : ''}`);
    }

    const { chart } = derived;
    console.log(`\nChart: ${chart ? `${chart.type} of ${chart.series ? chart.series.join(', ') : chart.y} by ${chart.x}${chart.threshold ? `, with a line at the ${chart.threshold.label}` : ''}` : 'none (a table only)'}`);

    console.log(`\nFirst ${Math.min(ROWS_SHOWN, run.rows.length)} rows:`);
    for (const row of run.rows.slice(0, ROWS_SHOWN)) console.log(`  ${row.map((cell) => formatCell(cell)).join(' | ')}`);

    if (unknownColumns.length > 0) {
        console.log(`\n✗ The card names ${unknownColumns.map((column) => `"${column}"`).join(', ')}, which the results don't have. Use the names above, exactly.`);
        process.exitCode = 1;
    } else if (hasCard) {
        console.log('\n✓ Every column the card names is in the results.');
    }
}

main().catch((error: unknown) => {
    console.error(describeError(error));
    process.exitCode = 1;
});
