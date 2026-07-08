"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { SeverityBadge } from "@/components/severity-badge";
import { formatDate } from "@/lib/utils";

interface Finding {
  id: string;
  severity: string;
  category: string;
  title: string;
  confidence: number;
  evidenceCount: number;
  status: string;
  createdAt: string;
}

const SEV_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4 };
const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open", VALID: "Valid", FALSE_POSITIVE: "False Positive", NEEDS_REVIEW: "Needs Review",
};

const col = createColumnHelper<Finding>();

export function FindingsTable({ uploadId }: { uploadId: string }) {
  const [data, setData] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  useEffect(() => {
    fetch(`/api/uploads/${uploadId}/findings`)
      .then((r) => r.json())
      .then((d) => setData(d.findings ?? []))
      .finally(() => setLoading(false));
  }, [uploadId]);

  const columns = useMemo(
    () => [
      col.accessor("severity", {
        header: "Severity",
        sortingFn: (a, b) => SEV_ORDER[a.original.severity] - SEV_ORDER[b.original.severity],
        cell: (c) => <SeverityBadge severity={c.getValue()} />,
      }),
      col.accessor("category", { header: "Category" }),
      col.accessor("title", {
        header: "Title",
        cell: (c) => (
          <Link href={`/uploads/${uploadId}/findings/${c.row.original.id}`} className="font-medium text-primary hover:underline">
            {c.getValue()}
          </Link>
        ),
      }),
      col.accessor("confidence", { header: "Confidence", cell: (c) => `${c.getValue()}%` }),
      col.accessor("evidenceCount", { header: "Evidence" }),
      col.accessor("status", { header: "Status", cell: (c) => STATUS_LABEL[c.getValue()] ?? c.getValue() }),
      col.accessor("createdAt", { header: "Created", cell: (c) => <span className="text-xs text-muted-foreground">{formatDate(c.getValue())}</span> }),
    ],
    [uploadId]
  );

  const filtered = useMemo(
    () => (severityFilter ? data.filter((f) => f.severity === severityFilter) : data),
    [data, severityFilter]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading findings…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter findings…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
          <option value="INFORMATIONAL">Informational</option>
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} finding(s)</span>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder ? null : (
                      <button
                        className="flex items-center gap-1 hover:text-foreground"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getCanSort() && <ArrowUpDown className="h-3 w-3 opacity-50" />}
                      </button>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                  No findings match your filters.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
