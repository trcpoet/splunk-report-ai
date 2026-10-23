import { unstable_rethrow } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import { getViewerOrNull } from "@/lib/dal";
import type { Viewer } from "@/lib/access";

// Reads the session, so the Navbar renders it inside <Suspense>. The menu sits
// in the root layout, outside the pages' error screens, so if the session
// can't be read (the database is down, say) it shows just the sign-out button
// and leaves the error to the page.
const UserMenu = async () => {
    let viewer: Viewer | null;
    try {
        viewer = await getViewerOrNull();
    } catch (error) {
        unstable_rethrow(error);
        return (
            <div className="user-menu">
                <SignOutButton />
            </div>
        );
    }

    if (!viewer) return null;

    const access = viewer.role === 'admin' ? 'Admin: all reports' : viewer.groups.join(', ') || 'No groups yet';

    return (
        <div className="user-menu">
            <div className="who">
                <span className="name">{viewer.name}</span>
                <span className="groups" title={access}>{access}</span>
            </div>
            <SignOutButton />
        </div>
    )
}

export default UserMenu
