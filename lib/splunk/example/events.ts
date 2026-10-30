// Dummy logs for the example Splunk (docs/splunk-example.md), as if from a small
// company's servers: what the example's six reports search. All made up: users
// are invented names, IPs come from the documentation ranges (192.0.2.0/24,
// 198.51.100.0/24, 203.0.113.0/24), and so do the hosts.
//
// A few things stand out on purpose, so the app has something to show:
// - web-03 returns more server errors than the 2% budget;
// - db-02's /data is 96% full;
// - db-03 and app-07 stopped sending, so they show as silent hosts;
// - at half past each hour, one IP tries 40 accounts a dozen times each.

export type EventBatch = { index: string; sourcetype: string; host: string; source: string; lines: string[] };

export type EventOptions = {
    // false while filling in the past (the setup's backfill), true for the
    // feeder's minute-by-minute logs.
    live?: boolean;
    // When the backfill runs. Silent hosts stop sending a while before it.
    now?: number;
};

const MINUTE = 60_000;

// The backfill sends every kind of log for these last hours, and only the
// sparse security logs before that: the busier reports look back 4 hours at most.
const FULL_BACKFILL_HOURS = 4;

// Seeded, so a given minute's logs come out the same every time.
function seeded(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const WEB_HOSTS = ['web-01', 'web-02', 'web-03', 'web-04', 'web-05', 'web-06'];
const FLAKY_WEB_HOST = 'web-03';
const WEB_PATHS = ['/', '/login', '/api/orders', '/api/cart', '/checkout', '/static/app.js', '/healthz'];
const USER_AGENTS = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6)', 'curl/8.9.1'];

// People who mistype their password now and then, the first ones most often.
const WINDOWS_USERS = [
    'j.smith', 'a.patel', 'm.garcia', 'svc-backup', 'l.chen', 'r.okafor', 'k.ivanova', 'd.kim', 'e.rossi', 'h.tanaka',
    'n.ahmed', 'o.lopez', 'p.wright', 's.muller', 't.nguyen', 'v.santos', 'w.brown', 'y.cohen', 'z.haddad', 'svc-deploy',
    'b.jones', 'c.dubois', 'f.silva', 'g.novak', 'i.berg', 'admin.jdoe', 'contractor07', 'guest', 'q.ali', 'u.park',
];
// The accounts the hourly password spraying tries.
const SPRAY_TARGETS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].flatMap((first) => ['adams', 'baker', 'clark', 'diaz', 'evans'].map((last) => `${first}.${last}`));
const SPRAY_SOURCE = '203.0.113.66';
const SSH_USERS = ['root', 'admin', 'ubuntu', 'deploy', 'oracle', 'test', 'git'];

// Windows sign-ins as one key=value line each. Not "WinEventLog": Splunk treats
// that name as real Windows event logs, which these lines aren't shaped like.
const WINDOWS_SOURCETYPE = 'windows_security';

const PORT_SCANNER = '203.0.113.200';
const FLOODER = '198.51.100.77';
const ZONES = ['dmz', 'internal', 'guest'];
const BLOCKED_PORTS = [22, 23, 25, 445, 1433, 3389, 8080];

// Host, mount and how full it is.
const DISKS: [host: string, mount: string, usedPct: number, sizeGb: number][] = [
    ['db-01', '/data', 71, 500], ['db-01', '/', 44, 50],
    ['db-02', '/data', 96, 500], ['db-02', '/', 52, 50],
    ['app-01', '/var', 63, 100], ['app-02', '/var', 91, 100], ['app-03', '/', 58, 50],
    ['web-05', '/', 88, 50], ['bastion-01', '/', 35, 50],
];
// Hosts that went quiet: they report disk space until this many minutes before
// the backfill runs, and the feeder never sends for them.
const SILENT_HOSTS: [host: string, mount: string, usedPct: number, sizeGb: number, quietMinutes: number][] = [
    ['db-03', '/data', 64, 500, 180],
    ['app-07', '/var', 49, 100, 90],
];

const GROUP_CHANGES = [
    { code: 4728, by: 'admin.jdoe', member: 'svc-backup', group: 'Domain Admins' },
    { code: 4732, by: 'admin.mkim', member: 'contractor07', group: 'Backup Operators' },
    { code: 4729, by: 'admin.jdoe', member: 'svc-backup', group: 'Domain Admins' },
    { code: 4756, by: 'admin.mkim', member: 'j.smith', group: 'Enterprise Admins' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const clock = (date: Date) => `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
// Apache's access log time: 29/Oct/2026:15:04:05 +0000
const accessTime = (date: Date) => `${pad(date.getUTCDate())}/${MONTHS[date.getUTCMonth()]}/${date.getUTCFullYear()}:${clock(date)} +0000`;
// Syslog's time: "Oct 29 15:04:05", with the day padded by a space.
const syslogTime = (date: Date) => `${MONTHS[date.getUTCMonth()]} ${String(date.getUTCDate()).padStart(2, ' ')} ${clock(date)}`;

// The logs from one minute, grouped the way Splunk receives them.
export function eventsForMinute(minute: Date, { live = true, now = minute.getTime() }: EventOptions = {}): EventBatch[] {
    const start = Math.floor(minute.getTime() / MINUTE) * MINUTE;
    const random = seeded(start / MINUTE);
    const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
    // A user, the first ones in the list far more often than the last.
    const usual = <T>(items: readonly T[]) => items[Math.floor(items.length * random() ** 2.5)];
    const moment = () => new Date(start + Math.floor(random() * MINUTE));
    const ip = (prefix: string, low: number, high: number) => `${prefix}.${low + Math.floor(random() * (high - low + 1))}`;

    const batches = new Map<string, EventBatch>();
    const add = (index: string, sourcetype: string, host: string, source: string, line: string) => {
        const key = `${index}|${sourcetype}|${host}`;
        const batch = batches.get(key) ?? { index, sourcetype, host, source, lines: [] };
        batch.lines.push(line);
        batches.set(key, batch);
    };

    const minutesAgo = (now - start) / MINUTE;
    const recent = live || minutesAgo <= FULL_BACKFILL_HOURS * 60;

    // Failed sign-ins: Windows and SSH, a couple a minute.
    for (let i = random() < 0.5 ? 1 : 2; i > 0; i--) {
        add('wineventlog', WINDOWS_SOURCETYPE, 'dc-01', 'windows_security',
            `${moment().toISOString()} LogName=Security EventCode=4625 TargetUserName=${usual(WINDOWS_USERS)} src_ip=${ip('192.0.2', 10, 60)} LogonType=3 Status=0xC000006D`);
    }
    if (random() < 0.7) {
        const user = pick(SSH_USERS);
        add('linux_secure', 'linux_secure', 'bastion-01', '/var/log/secure',
            `${syslogTime(moment())} bastion-01 sshd[${1000 + Math.floor(random() * 30000)}]: Failed password for ${user === 'root' ? '' : 'invalid user '}${user} from ${ip('203.0.113', 1, 120)} port ${40000 + Math.floor(random() * 20000)} ssh2`);
    }
    // Password spraying at half past each hour, from the feeder only, so it
    // shows up as a jump after the first runs.
    if (live && new Date(start).getUTCMinutes() === 30) {
        for (const user of SPRAY_TARGETS) {
            for (let attempt = 0; attempt < 12; attempt++) {
                add('wineventlog', WINDOWS_SOURCETYPE, 'dc-01', 'windows_security',
                    `${moment().toISOString()} LogName=Security EventCode=4625 TargetUserName=${user} src_ip=${SPRAY_SOURCE} LogonType=3 Status=0xC000006A`);
            }
        }
    }

    // Changes to privileged groups: a few a day.
    if ((start / MINUTE) % 397 === 0) {
        const change = pick(GROUP_CHANGES);
        add('wineventlog', WINDOWS_SOURCETYPE, 'dc-01', 'windows_security',
            `${moment().toISOString()} LogName=Security EventCode=${change.code} SubjectUserName=${change.by} MemberName=${change.member} TargetUserName="${change.group}"`);
    }

    if (!recent) return [...batches.values()];

    // Web requests: 30 a minute per server.
    for (const host of WEB_HOSTS) {
        const errorRate = host === FLAKY_WEB_HOST ? 0.04 : 0.004;
        for (let i = 0; i < 30; i++) {
            const roll = random();
            const status = roll < errorRate ? pick([500, 502, 503, 504]) : roll < 0.1 ? pick([301, 304, 404]) : 200;
            const method = random() < 0.8 ? 'GET' : 'POST';
            add('web', 'access_combined', host, '/var/log/httpd/access_log',
                `${ip('198.51.100', 1, 250)} - - [${accessTime(moment())}] "${method} ${pick(WEB_PATHS)} HTTP/1.1" ${status} ${200 + Math.floor(random() * 20000)} "-" "${pick(USER_AGENTS)}"`);
        }
    }

    // Firewall denies: background noise, one IP scanning ports, one flooding RDP.
    const deny = (src: string, port: number) =>
        add('firewall', 'pan:traffic', 'fw-01', 'udp:514',
            `${moment().toISOString()} action=denied src_ip=${src} src_port=${1024 + Math.floor(random() * 60000)} dest_ip=${ip('192.0.2', 100, 140)} dest_port=${port} transport=tcp dest_zone=${pick(ZONES)} rule=deny-inbound`);
    for (let i = 0; i < 15; i++) deny(ip('198.51.100', 1, 60), pick(BLOCKED_PORTS));
    for (let i = 0; i < 25; i++) deny(PORT_SCANNER, ((start / MINUTE) * 25 + i) % 1024 + 1);
    for (let i = 0; i < 20; i++) deny(FLOODER, 3389);

    // Disk space: every host reports each mount once a minute.
    const disk = (host: string, mount: string, usedPct: number, sizeGb: number) =>
        add('os', 'df', host, 'df',
            `${new Date(start + 5_000).toISOString()} MountedOn=${mount} UsePct=${usedPct} Avail=${(sizeGb * (100 - usedPct) / 100).toFixed(1)}G Size=${sizeGb}G`);
    for (const [host, mount, usedPct, sizeGb] of DISKS) disk(host, mount, usedPct, sizeGb);
    for (const [host, mount, usedPct, sizeGb, quietMinutes] of SILENT_HOSTS) {
        if (!live && minutesAgo > quietMinutes) disk(host, mount, usedPct, sizeGb);
    }

    return [...batches.values()];
}
