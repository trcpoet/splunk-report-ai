import type { Metadata } from "next";
import AiChat from "@/components/AiChat";
import { ChatSkeleton } from "@/components/Skeletons";
import { Reveal } from "@/components/Transitions";

export const metadata: Metadata = { title: 'Write SPL | SplunkEvents' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const WriteSplPage = ({ searchParams }: Props) => (
    <Reveal fallback={<ChatSkeleton />}>
        <AiChat kind="spl" searchParams={searchParams} />
    </Reveal>
)

export default WriteSplPage
