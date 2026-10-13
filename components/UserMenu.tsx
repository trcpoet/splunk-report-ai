import SignOutButton from "@/components/SignOutButton";
import { getViewerOrNull } from "@/lib/dal";

// Reads the session, so the Navbar renders it inside <Suspense>.
const UserMenu = async () => {
    const viewer = await getViewerOrNull();
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
