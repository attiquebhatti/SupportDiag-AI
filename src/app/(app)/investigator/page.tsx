import Link from "next/link";
import { Bot, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadScope } from "@/lib/scope";
import { Card, CardContent } from "@/components/ui/card";
import { VendorBadge, ProductBadge } from "@/components/badges";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function InvestigatorHubPage() {
  const user = await getCurrentUser();
  const scope = uploadScope(user!);
  const cases = await prisma.upload.findMany({
    where: { ...scope, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { device: true, assets: { take: 1 } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Bot className="h-6 w-6 text-primary" /> AI Investigator</h1>
        <p className="text-sm text-muted-foreground">Open a case to investigate it with the evidence-grounded AI assistant. AI responses are grounded only in extracted evidence from this case.</p>
      </div>

      {!config.ai.enabled && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-300">
          AI answering is currently disabled on this deployment. The investigator will surface the most relevant redacted evidence for manual review.
        </div>
      )}

      {cases.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-16 text-center text-sm text-muted-foreground">No completed analyses to investigate yet.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cases.map((c) => (
            <Link key={c.id} href={`/uploads/${c.id}/ai`}>
              <Card className="card-hover h-full">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <span className="truncate font-medium">{c.originalFilename}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-xs text-muted-foreground">{c.device?.hostname ?? c.assets[0]?.hostname ?? "Unknown host"}</div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <VendorBadge vendor={c.detectedVendor ?? c.selectedVendor} />
                    <ProductBadge product={c.detectedProduct ?? c.selectedProduct} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
