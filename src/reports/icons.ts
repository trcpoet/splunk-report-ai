import type { ReportCategory } from '@/reports/reports';

// The icon on each report's card and page. Every report gets one:
//   1. the card's `icon:` in config/report-cards.yaml, when it has one;
//   2. otherwise a guess from the first rule below whose words appear in the
//      report's title, then its tags, then its description;
//   3. otherwise its category's icon.
// The names are Lucide's (lucide.dev/icons), so any of them can be looked up
// there. To offer another icon, add its name here and its component in
// src/reports/components/ReportIcon.tsx; typecheck fails until both match.
// Plain data, no React: the sync, the scripts and the schema use it too.

export const ICON_NAMES = [
    // Security
    'shield', 'shield-alert', 'shield-check', 'key-round', 'user-lock', 'user-cog', 'brick-wall-fire', 'globe-lock',
    'radar', 'bug', 'mail-warning', 'file-lock', 'scan-search',
    // Operations
    'activity', 'server-crash', 'globe', 'timer', 'gauge', 'route', 'workflow', 'siren', 'container', 'clock-alert',
    'heart-pulse', 'webhook',
    // Infrastructure
    'server', 'hard-drive', 'cpu', 'memory-stick', 'radio-tower', 'database', 'database-zap', 'network', 'cloud',
    'cloud-alert', 'wifi-off', 'plug-zap', 'layers',
    // Business
    'trending-up', 'credit-card', 'banknote', 'receipt-text', 'shopping-cart', 'users-round', 'chart-line', 'landmark',
    // Compliance
    'clipboard-check', 'scale', 'scroll-text',
    // Anything
    'earth', 'map-pin', 'mail', 'file-text', 'file-chart-column-increasing',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const isIconName = (value: unknown): value is IconName => (ICON_NAMES as readonly unknown[]).includes(value);

export const CATEGORY_ICONS: Record<ReportCategory, IconName> = {
    Security: 'shield',
    Operations: 'activity',
    Infrastructure: 'server',
    Business: 'trending-up',
    Compliance: 'clipboard-check',
    Other: 'file-chart-column-increasing',
};

// Checked in order, and the first rule with a matching word wins, so the
// specific ones come first: "VPN Sessions by Country" is about the VPN, and
// "Daily Payment Volume & Latency" about payments. A word matches the whole
// word or its plural ("login" matches "logins", "latency" "latencies"); a word
// ending in * matches any word starting with it ("vulnerab*" matches
// "vulnerability"). Upper case, accents, hyphens and punctuation don't
// matter, and a word can be a phrase. Each tag is matched on its own.
export const ICON_RULES: { icon: IconName; words: string[] }[] = [
    { icon: 'globe-lock', words: ['vpn', 'remote access', 'tunnel'] },
    { icon: 'brick-wall-fire', words: ['firewall', 'deny', 'denied', 'blocked connection'] },
    { icon: 'radar', words: ['port scan', 'scan', 'recon', 'probe'] },
    { icon: 'mail-warning', words: ['phish*', 'spam'] },
    { icon: 'bug', words: ['vulnerab*', 'cve', 'malware', 'virus', 'exploit*', 'ransomware'] },
    { icon: 'user-lock', words: ['lockout', 'locked out', 'locked account'] },
    { icon: 'key-round', words: ['login', 'logon', 'log in', 'sign in', 'signin', 'auth', 'authentication', 'authenticated', 'authorization', 'password', 'credential', 'mfa', '2fa', 'sso'] },
    { icon: 'user-cog', words: ['privilege*', 'admin*', 'role', 'permission', 'group membership', 'sudo'] },
    { icon: 'file-lock', words: ['dlp', 'data loss', 'encrypt*', 'sensitive', 'pii', 'exfil*'] },
    { icon: 'shield-check', words: ['certificate', 'tls', 'ssl'] },
    { icon: 'shield-alert', words: ['threat', 'attack', 'intrusion', 'suspicious', 'anomal*', 'brute force', 'fraud'] },
    { icon: 'credit-card', words: ['payment', 'transaction', 'checkout', 'credit card', 'card payment'] },
    { icon: 'receipt-text', words: ['invoice', 'billing', 'refund', 'chargeback'] },
    { icon: 'shopping-cart', words: ['order', 'cart', 'basket', 'ecommerce', 'e commerce'] },
    { icon: 'banknote', words: ['revenue', 'sales', 'money', 'cash'] },
    { icon: 'server-crash', words: ['5xx', 'error', 'exception', 'crash', 'outage', 'fatal', 'panic'] },
    { icon: 'hard-drive', words: ['disk', 'storage', 'filesystem', 'file system', 'mount', 'inode'] },
    { icon: 'cpu', words: ['cpu', 'processor', 'load average'] },
    { icon: 'memory-stick', words: ['memory', 'ram', 'heap', 'oom', 'out of memory', 'swap'] },
    { icon: 'radio-tower', words: ['forwarder', 'heartbeat', 'silent', 'collector'] },
    { icon: 'database-zap', words: ['license', 'licensing', 'ingest*', 'quota'] },
    { icon: 'container', words: ['kubernetes', 'k8s', 'pod', 'container', 'docker', 'openshift'] },
    { icon: 'cloud', words: ['cloud', 'aws', 'azure', 'gcp', 's3', 'lambda'] },
    { icon: 'network', words: ['network', 'dns', 'dhcp', 'bandwidth', 'router', 'switch', 'packet', 'netflow', 'connection'] },
    { icon: 'timer', words: ['latency', 'response time', 'slow', 'timeout', 'duration'] },
    { icon: 'gauge', words: ['utiliz*', 'utilis*', 'capacity', 'saturation', 'usage', 'sla', 'slo'] },
    { icon: 'clipboard-check', words: ['audit', 'review', 'attest*', 'certification', 'change management'] },
    { icon: 'scale', words: ['compliance', 'pci', 'sox', 'gdpr', 'hipaa', 'regulat*', 'policy', 'retention'] },
    { icon: 'route', words: ['api', 'endpoint', 'gateway'] },
    { icon: 'workflow', words: ['job', 'batch', 'pipeline', 'etl', 'cron', 'schedul*'] },
    { icon: 'siren', words: ['incident', 'alert', 'on call', 'escalat*'] },
    { icon: 'earth', words: ['country', 'geo', 'geoip', 'geolocation', 'geographic', 'region', 'location', 'travel'] },
    { icon: 'globe', words: ['web', 'http', 'https', 'request', 'url', 'website', 'site', 'traffic', 'browser'] },
    { icon: 'mail', words: ['email', 'smtp', 'mailbox'] },
    { icon: 'server', words: ['host', 'server', 'node', 'machine', 'vm'] },
    { icon: 'users-round', words: ['user', 'account', 'identity', 'customer', 'signup', 'session'] },
    { icon: 'trending-up', words: ['kpi', 'growth', 'trend', 'conversion', 'volume'] },
    { icon: 'activity', words: ['performance', 'health', 'availability', 'uptime', 'apm', 'throughput'] },
];

// Lower case without accents, with anything but letters and digits as single
// spaces, and a space at each end, so " login " finds the whole word.
const normalize = (text: string) =>
    ` ${text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

// Each rule word as the texts it looks for, worked out once: whole words
// with their plurals (" login ", " logins "), or a word's start (" vulnerab").
const MATCHERS = ICON_RULES.map(({ icon, words }) => ({
    icon,
    words: words.map((word) => {
        if (word.endsWith('*')) return { word, forms: [normalize(word.slice(0, -1)).trimEnd()] };
        const whole = normalize(word).trim();
        const plurals = whole.endsWith('y') ? [`${whole.slice(0, -1)}ies`] : [`${whole}s`, `${whole}es`];
        return { word, forms: [whole, ...plurals].map((form) => ` ${form} `) };
    }),
}));

export type IconChoice = { icon: IconName; reason: string };

type IconInput = { title: string; tags?: readonly string[]; description?: string; category: ReportCategory };

// The guess for a report without an `icon:` in its card, and why, as
// `npm run card:preview` prints it: 'from "login" in the title'.
export function iconFor({ title, tags = [], description = '', category }: IconInput): IconChoice {
    const places: [string, string[]][] = [
        ['the title', [normalize(title)]],
        ['the tags', tags.map(normalize)],
        ['the description', [normalize(description)]],
    ];
    for (const [place, texts] of places) {
        for (const rule of MATCHERS) {
            const match = rule.words.find(({ forms }) => texts.some((text) => forms.some((form) => text.includes(form))));
            if (match) return { icon: rule.icon, reason: `from "${match.word}" in ${place}` };
        }
    }
    return { icon: CATEGORY_ICONS[category], reason: `the ${category} category's icon` };
}

// The icon a report shows: its card's choice, or the guess. The choice is
// checked, since it comes from the database.
export const reportIcon = (report: IconInput & { icon?: string | null }): IconName =>
    isIconName(report.icon) ? report.icon : iconFor(report).icon;
