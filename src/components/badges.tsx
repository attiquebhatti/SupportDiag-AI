import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { VENDORS, PRODUCT_MAP, vendorLabel, productLabel, type ProductStatus } from "@/lib/vendors";
import { Icon } from "@/components/icon";

export function VendorBadge({ vendor, className }: { vendor?: string | null; className?: string }) {
  if (!vendor) return <Badge className={cn("border-border bg-muted text-muted-foreground", className)}>Unknown</Badge>;
  const v = (VENDORS as Record<string, { icon: string }>)[vendor];
  return (
    <Badge className={cn("gap-1 border-border bg-secondary text-secondary-foreground", className)}>
      {v && <Icon name={v.icon} className="h-3 w-3" />}
      {vendorLabel(vendor)}
    </Badge>
  );
}

export function ProductBadge({ product, className }: { product?: string | null; className?: string }) {
  if (!product) return <Badge className={cn("border-border bg-muted text-muted-foreground", className)}>Generic</Badge>;
  const p = PRODUCT_MAP[product];
  return (
    <Badge className={cn("gap-1 border-primary/25 bg-primary/10 text-primary", className)}>
      {p && <Icon name={p.icon} className="h-3 w-3" />}
      {productLabel(product)}
    </Badge>
  );
}

const STATUS_STYLES: Record<ProductStatus, string> = {
  supported: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  beta: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  planned: "border-slate-500/30 bg-slate-500/10 text-slate-400",
};

export function ProductStatusBadge({ status, className }: { status: ProductStatus; className?: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge className={cn("border", STATUS_STYLES[status], className)}>{label}</Badge>;
}

const UPLOAD_STATUS_STYLES: Record<string, string> = {
  COMPLETED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  PROCESSING: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  QUEUED: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  UPLOADED: "border-slate-500/30 bg-slate-500/10 text-slate-400",
  FAILED: "border-red-500/30 bg-red-500/10 text-red-500",
  DELETED: "border-slate-500/30 bg-slate-500/10 text-slate-400",
};

const UPLOAD_STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Completed",
  PROCESSING: "Processing",
  QUEUED: "Queued",
  UPLOADED: "Uploaded",
  FAILED: "Processing Failed",
  DELETED: "Deleted",
};

export function UploadStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge className={cn("border", UPLOAD_STATUS_STYLES[status] ?? UPLOAD_STATUS_STYLES.UPLOADED, className)}>
      {UPLOAD_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function ConfidenceBadge({ level, className }: { level?: string | null; className?: string }) {
  const l = (level ?? "low").toLowerCase();
  const style =
    l === "high" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
    : l === "medium" ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
    : "border-slate-500/30 bg-slate-500/10 text-slate-400";
  const label = l === "high" ? "High" : l === "medium" ? "Medium" : "Low";
  return <Badge className={cn("border", style, className)}>Parser confidence: {label}</Badge>;
}
