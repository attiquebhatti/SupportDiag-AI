import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SEVERITY_META } from "@/lib/utils";

export function SeverityBadge({ severity }: { severity: string }) {
  const meta = SEVERITY_META[severity] ?? SEVERITY_META.INFORMATIONAL;
  return <Badge className={cn("border", meta.className)}>{meta.label}</Badge>;
}
