import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { uploadScope } from "@/lib/scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductStatusBadge } from "@/components/badges";
import { Icon } from "@/components/icon";
import { VENDORS, PRODUCTS, type VendorId } from "@/lib/vendors";

export const dynamic = "force-dynamic";

const MATURITY_STYLE: Record<string, string> = {
  high: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  low: "border-slate-500/30 bg-slate-500/10 text-slate-400",
};

export default async function ParsersPage() {
  const user = await getCurrentUser();
  const scope = uploadScope(user!);

  const [parsers, rules, analyzedByProduct] = await Promise.all([
    prisma.vendorParser.findMany(),
    prisma.diagnosticRule.groupBy({ by: ["product"], _count: true }),
    prisma.upload.groupBy({ by: ["detectedProduct"], _count: true, where: scope }),
  ]);

  const ruleCount = (product: string) => rules.find((r) => r.product === product)?._count ?? 0;
  const analyzedCount = (product: string) => analyzedByProduct.find((a) => a.detectedProduct === product)?._count ?? 0;
  const parserFor = (product: string) => parsers.find((p) => p.product === product);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendor Parsers</h1>
        <p className="text-sm text-muted-foreground">Parser modules and diagnostic rule sets per vendor and product. Detection, parsing, and rules are registry-driven.</p>
      </div>

      {(Object.keys(VENDORS) as VendorId[]).map((vid) => {
        const vendor = VENDORS[vid];
        const products = PRODUCTS.filter((p) => p.vendor === vid);
        return (
          <div key={vid} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted"><Icon name={vendor.icon} className="h-4 w-4 text-primary" /></div>
              <h2 className="text-lg font-semibold">{vendor.label}</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {products.map((p) => {
                const parser = parserFor(p.id);
                const dbMaturity = parser?.maturity ?? p.maturity;
                return (
                  <Card key={p.id} className="card-hover">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-sm"><Icon name={p.icon} className="h-4 w-4 text-primary" /> {p.shortLabel}</CardTitle>
                        <ProductStatusBadge status={p.status} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <p className="text-muted-foreground">{p.blurb}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Parser maturity</span>
                        <Badge className={`border ${MATURITY_STYLE[dbMaturity] ?? MATURITY_STYLE.low}`}>{dbMaturity}</Badge>
                      </div>
                      <div className="flex items-center justify-between"><span className="text-muted-foreground">Diagnostic rules</span><span className="font-medium">{ruleCount(p.id)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-muted-foreground">Files analyzed</span><span className="font-medium">{analyzedCount(p.id)}</span></div>
                      <div className="flex items-center justify-between border-t pt-2">
                        <span className="text-muted-foreground">Status</span>
                        <span className={parser?.enabled !== false ? "text-emerald-500" : "text-muted-foreground"}>{parser?.enabled !== false ? "Enabled" : "Disabled"}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
