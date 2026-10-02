import { formatNumber } from "@/lib/format";

type Cell = string | number;

const ResultsTable = ({ columns, rows }: { columns: string[]; rows: Cell[][] }) => {
    // Right-align columns that only hold numbers, header included.
    const numericColumns = columns.map((_, i) => rows.length > 0 && rows.every((row) => typeof row[i] === 'number'));

    return (
        <div className="table-wrap">
            <table className="results-table">
                <thead>
                    <tr>
                        {columns.map((column, i) => (
                            <th key={column} scope="col" className={numericColumns[i] ? 'numeric' : undefined}>{column}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                            {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className={typeof cell === 'number' ? 'numeric' : undefined}>
                                    {typeof cell === 'number' ? formatNumber(cell) : cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default ResultsTable
