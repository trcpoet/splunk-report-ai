import { getSyncNotice } from "@/reports/dal";

// Says so when the reports may be out of date, so old numbers don't pass for
// current ones.
const SyncNotice = async () => {
    const notice = await getSyncNotice();
    if (!notice) return null;

    return (
        <p className="sync-notice status-warning" role="status">
            {notice.message}
            {notice.detail && <span className="detail">{notice.detail}</span>}
        </p>
    )
}

export default SyncNotice
