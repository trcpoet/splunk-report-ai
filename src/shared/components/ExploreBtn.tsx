'use client';

import Image from "next/image";
import type { MouseEvent } from "react";

// Glides down to the report list, or jumps for people who ask for less motion.
// Only this button scrolls smoothly: page-wide smooth scrolling would also slow
// Next's own scrolling between pages and leave it short of the top.
const scrollToReports = (event: MouseEvent<HTMLAnchorElement>) => {
    const list = document.getElementById('reports');
    if (!list) return;

    event.preventDefault();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth' });
    window.history.replaceState(null, '', '#reports');
}

const ExploreBtn = () => {
    return (
        <a href="#reports" id="explore-btn" className="mt-7 mx-auto" onClick={scrollToReports}>
            Browse Reports
            <Image src="/icons/arrow-down.svg" alt="" width={25} height={24} />
        </a>
    )
}

export default ExploreBtn
