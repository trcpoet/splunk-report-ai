import Image from "next/image";
import { Suspense } from "react";
import NavLinks, { HomeLink, NavLinkList } from "@/components/NavLinks";
import { UserMenuSkeleton } from "@/components/Skeletons";
import UserMenu from "@/components/UserMenu";

const Navbar = () => {
    return (
        <header>
            <nav>
                <HomeLink className="logo">
                    <Image src="/icons/logo.svg" alt="SplunkEvents logo" width={24} height={24} />

                    <p>SplunkEvents</p>
                </HomeLink>

                <ul>
                    {/* Marking the current page needs the address, which a report
                        page's prerendered shell doesn't know yet. */}
                    <Suspense fallback={<NavLinkList />}>
                        <NavLinks />
                    </Suspense>
                    <li>
                        <Suspense fallback={<UserMenuSkeleton />}>
                            <UserMenu />
                        </Suspense>
                    </li>
                </ul>
            </nav>
        </header>
    )
}

export default Navbar
