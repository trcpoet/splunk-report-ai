import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * POST /api/revalidate
 * Called by the sync worker after it writes new data, so pages show it right
 * away. Needs `Authorization: Bearer <REVALIDATE_SECRET>`.
 */
export async function POST(request: Request) {
    const secret = process.env.REVALIDATE_SECRET;
    const given = request.headers.get('authorization') ?? '';

    // Comparing fixed-length digests takes the same time whatever was sent.
    if (!secret || !timingSafeEqual(digest(given), digest(`Bearer ${secret}`))) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Outside a Server Action, { expire: 0 } is how to expire cached data at once.
    revalidateTag('reports', { expire: 0 });
    return NextResponse.json({ revalidated: true });
}
