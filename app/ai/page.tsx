import { redirect } from "next/navigation";

// The navbar's Ask AI link opens the first tab.
const AiPage = () => redirect('/ai/reports');

export default AiPage
