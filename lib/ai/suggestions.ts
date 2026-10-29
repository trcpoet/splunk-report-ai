import { needsAttention, type ReportListItem } from '@/lib/reports';

// Questions to start a chat with, built from the reports the person can see,
// so the first click already says something about their own data. Pure: no
// AI call is needed to make them.

type Report = Pick<ReportListItem, 'slug' | 'title' | 'status' | 'index'>;

// For Ask about reports.
export function reportQuestions(reports: Report[]): string[] {
    if (reports.length === 0) return [];

    const attention = reports.filter(needsAttention);
    const questions = attention
        .slice(0, 2)
        .map((report) => `Why is ${report.title} ${report.status === 'failed' ? 'failing' : 'warning'}?`);

    if (attention.length === 0) questions.push('Is anything in my reports worth a closer look?');
    questions.push('Summarize my reports in three bullet points.');
    if (reports.length > 1) questions.push('Which report changed most since its previous run?');

    return questions.slice(0, 4);
}

// For Write SPL: searches that fit the indexes the person's reports use.
export function splRequests(reports: Report[]): string[] {
    const indexes = reports.map((report) => report.index.toLowerCase()).join(' ');
    const requests: string[] = [];

    if (/wineventlog|linux_secure/.test(indexes)) requests.push('Failed logins by source IP in the last 24 hours');
    if (/\bweb\b|access_combined/.test(indexes)) requests.push('Top 10 URLs returning 5xx errors in the last hour');
    if (/firewall|pan:traffic/.test(indexes)) requests.push('Denied connections by destination port in the last 4 hours');
    if (/\bvpn\b|cisco:asa/.test(indexes)) requests.push('VPN sign-ins by country in the last 7 days');
    if (requests.length < 2) requests.push('Count events by sourcetype in the last hour');

    // Last, so there's always one about a search they already have.
    return [...requests.slice(0, 3), ...(reports[0] ? [explainRequest(reports[0])] : [])];
}

// For links from a report (?about=<slug>, ?explain=<slug>).
export const aboutQuestion = (report: Pick<Report, 'title'>) => `What should I know about ${report.title}?`;
export const explainRequest = (report: Pick<Report, 'title'>) => `Explain the search behind ${report.title}, step by step.`;
