import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import UserMenu from "@/components/UserMenu";

const Navbar = () => {
    return (
        <header>
            <nav>
                <Link href='/' className="logo">
                    <Image src="/icons/logo.svg" alt="SplunkEvents logo" width={24} height={24} />

                    <p>SplunkEvents</p>
                </Link>

                <ul>
                    <li><Link href="/">Overview</Link></li>
                    <li><Link href="/#reports">All Reports</Link></li>
                    <li>
                        <Suspense fallback={null}>
                            <UserMenu />
                        </Suspense>
                    </li>
                </ul>
            </nav>
        </header>
    )
}

export default Navbar
