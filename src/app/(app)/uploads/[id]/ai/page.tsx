import { Bot } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { AIAssistant } from "@/components/ai-assistant";
import { VendorBadge, ProductBadge } from "@/components/badges";
import { PRODUCT_MAP } from "@/lib/vendors";

export const dynamic = "force-dynamic";

export default async function AIPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const upload = await prisma.upload.findUnique({
    where: { id },
    select: { detectedVendor: true, selectedVendor: true, detectedProduct: true, selectedProduct: true },
  });
  const vendor = upload?.detectedVendor ?? upload?.selectedVendor ?? null;
  const product = upload?.detectedProduct ?? upload?.selectedProduct ?? null;
  const suggestions = product ? PRODUCT_MAP[product]?.suggestedQuestions : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Bot className="h-5 w-5 text-primary" /> AI Investigator</h2>
        <div className="flex items-center gap-1">
          <VendorBadge vendor={vendor} />
          <ProductBadge product={product} />
        </div>
      </div>
      <AIAssistant uploadId={id} suggestions={suggestions} />
    </div>
  );
}
