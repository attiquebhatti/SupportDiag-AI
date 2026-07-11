"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, ExternalLink, AlertTriangle, Bot, FileDown, Trash2, Play } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { VendorBadge, ProductBadge, UploadStatusBadge } from "@/components/badges";
import { formatDate } from "@/lib/utils";

export interface AnalysisRow {
  id: string;
  originalFilename: string;
  status: string;
  vendor: string | null;
  product: string | null;
  hostname: string | null;
  healthScore: number | null;
  critical: number;
  high: number;
  uploadedBy: string;
  createdAt: string;
}

function healthColor(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 90) return "text-emerald-500";
  if (score >= 75) return "text-amber-400";
  if (score >= 50) return "text-amber-500";
  if (score >= 25) return "text-orange-500";
  return "text-red-500";
}

export function RecentAnalyses({ rows }: { rows: AnalysisRow[] }) {
  const router = useRouter();

  async function del(id: string) {
    if (!confirm("Delete this case? This purges the stored archive and extracted data.")) return;
    const res = await fetch(`/api/uploads/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  async function processNow(id: string) {
    fetch(`/api/uploads/${id}/process`, { method: "POST" }).catch(() => {});
    router.push(`/uploads/${id}/status`);
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead>Case</TableHead>
            <TableHead>Vendor / Product</TableHead>
            <TableHead>Hostname</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-center">Health</TableHead>
            <TableHead className="text-center">Crit / High</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const href = r.status === "COMPLETED" ? `/uploads/${r.id}` : `/uploads/${r.id}/status`;
            return (
              <TableRow key={r.id} className="group">
                <TableCell>
                  <Link href={href} className="font-medium hover:text-primary">{r.originalFilename}</Link>
                  <div className="text-[11px] text-muted-foreground">by {r.uploadedBy}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <VendorBadge vendor={r.vendor} />
                    <ProductBadge product={r.product} />
                  </div>
                </TableCell>
                <TableCell className="text-sm">{r.hostname ?? "—"}</TableCell>
                <TableCell><UploadStatusBadge status={r.status} /></TableCell>
                <TableCell className="text-center">
                  <span className={`font-semibold ${healthColor(r.healthScore)}`}>{r.healthScore ?? "—"}</span>
                </TableCell>
                <TableCell className="text-center text-sm">
                  <span className="text-red-500">{r.critical}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-orange-500">{r.high}</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="rounded-md p-1.5 text-muted-foreground opacity-60 hover:bg-accent hover:opacity-100">
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(href)}><ExternalLink /> Open analysis</DropdownMenuItem>
                      {r.status !== "COMPLETED" && r.status !== "PROCESSING" && (
                        <DropdownMenuItem onClick={() => processNow(r.id)}><Play /> Process Now</DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => router.push(`/uploads/${r.id}/findings`)}><AlertTriangle /> View findings</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push(`/uploads/${r.id}/ai`)}><Bot /> Ask AI</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push(`/uploads/${r.id}/report`)}><FileDown /> Export report</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => del(r.id)} className="text-destructive focus:text-destructive"><Trash2 /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
