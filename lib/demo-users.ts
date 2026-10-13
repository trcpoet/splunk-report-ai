import type { Role } from '@/lib/access';

// Created by `npm run seed`, all with the password in DEMO_PASSWORD. Their groups
// match email lists in the dummy reports, so each one sees a different set.
export const DEMO_USERS: { email: string; name: string; role: Role; groups: string[] }[] = [
    { email: 'admin@example.com', name: 'Demo Admin', role: 'admin', groups: [] },
    { email: 'soc.analyst@example.com', name: 'SOC Analyst', role: 'viewer', groups: ['secops', 'soc-tier1'] },
    { email: 'sre.oncall@example.com', name: 'SRE On-call', role: 'viewer', groups: ['sre', 'web-oncall', 'infra-oncall'] },
    { email: 'finance.analyst@example.com', name: 'Finance Analyst', role: 'viewer', groups: ['finance-ops', 'it-finance'] },
    { email: 'it.director@example.com', name: 'IT Director', role: 'viewer', groups: ['it-director'] },
];
