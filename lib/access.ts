// Who may open which report. Pure, so the data access layer, the API routes and
// the tests share one rule.

export type Role = 'admin' | 'viewer';

// The signed-in user, plus the groups that decide which reports they see.
export type Viewer = {
    id: string;
    name: string;
    email: string;
    role: Role;
    groups: string[];
};

// Admins see everything. Everyone else needs at least one group in common with
// the report, so a report with no groups is admin-only. Group names match exactly.
export const canView = (viewer: Pick<Viewer, 'role' | 'groups'>, allowedGroups: readonly string[]) =>
    viewer.role === 'admin' || allowedGroups.some((group) => viewer.groups.includes(group));
