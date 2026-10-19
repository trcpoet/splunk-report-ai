'use client';

import { useMemo } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import {
    columnFilteringFeature,
    createColumnHelper,
    createFilteredRowModel,
    createSortedRowModel,
    globalFilteringFeature,
    rowSortingFeature,
    tableFeatures,
    useTable,
    type FilterFn,
    type SortFn,
} from "@tanstack/react-table";
import { formatNumber, parseNumber } from "@/lib/format";

type Cell = string | number;

type Props = {
    columns: string[];
    rows: Cell[][];
    // Adds a box that filters the rows. For report results, not short lists.
    filterable?: boolean;
    // What to sort a column by when its text doesn't sort in order, such as
    // "Oct 2, 09:00 UTC" or "2m 14s". Keyed by column name, one value per row.
    sortValues?: Record<string, Cell[]>;
};

// Only the features this table uses; TanStack Table leaves the rest out of the bundle.
const features = tableFeatures({
    rowSortingFeature,
    columnFilteringFeature,
    globalFilteringFeature,
    sortedRowModel: createSortedRowModel(),
    filteredRowModel: createFilteredRowModel(),
});

const columnHelper = createColumnHelper<typeof features, Cell[]>();

// Natural order, so "web-prod-9" comes before "web-prod-10".
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

// Numbers sort by value, including ones Splunk sent as text such as "$1,234",
// "1.84%" or "12G"; everything else in natural order.
const compareCells = (a: Cell, b: Cell) => {
    const [first, second] = [parseNumber(a), parseNumber(b)];
    return first !== null && second !== null ? first - second : collator.compare(String(a), String(b));
};

const isNumeric = (cell: Cell) => parseNumber(cell) !== null;

const display = (cell: Cell) => (typeof cell === 'number' ? formatNumber(cell) : cell);

// Matches the text on screen ("48,210") as well as the raw number ("48210").
const matchesFilter: FilterFn<typeof features, Cell[]> = (row, columnId, filterValue) => {
    const cell = row.getValue<Cell>(columnId);
    const query = String(filterValue).trim().toLowerCase();

    return [String(cell), display(cell)].some((text) => text.toLowerCase().includes(query));
};

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

// Click a header to sort by it: numbers start with the largest, text from A to
// Z, and a third click goes back to the order the results came in.
const ResultsTable = ({ columns, rows, filterable = false, sortValues }: Props) => {
    const { columnDefs, numericColumns } = useMemo(() => {
        // Columns that only hold numbers are right-aligned, header included,
        // and sort largest first.
        const numeric = columns.map((_, i) => rows.length > 0 && rows.every((row) => isNumeric(row[i])));

        const defs = columnHelper.columns(columns.map((name, i) => {
            const keys = sortValues?.[name];
            const sortFn: SortFn<typeof features, Cell[]> = (a, b) =>
                compareCells(keys?.[a.index] ?? a.original[i], keys?.[b.index] ?? b.original[i]);

            return columnHelper.accessor((row) => row[i], {
                id: String(i),
                header: name,
                cell: ({ getValue }) => display(getValue()),
                sortFn,
                sortDescFirst: numeric[i],
            });
        }));

        return { columnDefs: defs, numericColumns: numeric };
    }, [columns, rows, sortValues]);

    const table = useTable({
        features,
        columns: columnDefs,
        data: rows,
        globalFilterFn: matchesFilter,
    });

    const query: string = table.state.globalFilter ?? '';
    const shown = table.getRowModel().rows;

    return (
        <>
            {filterable && (
                <div className="table-filter">
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => table.setGlobalFilter(e.target.value)}
                        placeholder="Filter rows"
                        aria-label="Filter rows"
                    />
                    <span aria-live="polite">
                        {query.trim() ? `${shown.length} of ${rows.length} rows match` : ''}
                    </span>
                </div>
            )}

            <div className="table-wrap">
                <table className="results-table">
                    <thead>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    const sorted = header.column.getIsSorted();
                                    const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;

                                    return (
                                        <th
                                            key={header.id}
                                            scope="col"
                                            className={numericColumns[Number(header.column.id)] ? 'numeric' : undefined}
                                            aria-sort={sorted ? ARIA_SORT[sorted] : undefined}
                                        >
                                            <button type="button" onClick={header.column.getToggleSortingHandler()}>
                                                <table.FlexRender header={header} />
                                                <SortIcon aria-hidden="true" className="sort-icon" />
                                            </button>
                                        </th>
                                    );
                                })}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {shown.map((row) => (
                            <tr key={row.id}>
                                {row.getAllCells().map((cell) => (
                                    <td key={cell.id} className={isNumeric(cell.getValue<Cell>()) ? 'numeric' : undefined}>
                                        <table.FlexRender cell={cell} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {shown.length === 0 && rows.length > 0 && (
                            <tr>
                                <td colSpan={columns.length} className="no-match">No rows match “{query.trim()}”.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </>
    )
}

export default ResultsTable
