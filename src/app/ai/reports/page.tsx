import type { Metadata } from "next";
import AiChat from "@/ai/components/AiChat";
import { ChatSkeleton } from "@/shared/components/Skeletons";
import { Reveal } from "@/shared/components/Transitions";

export const metadata: Metadata = { title: 'Ask about reports | SplunkEvents' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const AskAboutReportsPage = ({ searchParams }: Props) => (
    <Reveal fallback={<ChatSkeleton />}>
        <AiChat kind="reports" searchParams={searchParams} />
    </Reveal>
)

export default AskAboutReportsPage
