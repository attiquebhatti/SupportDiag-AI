import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { AnalysisNav } from "@/components/analysis-nav";
import { DeleteCaseButton } from "@/components/delete-case-button";

export default async function UploadLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload || upload.deletedAt) notFound();

  // Access control (owner / same org / admin).
  const allowed =
    user?.role === "ADMIN" ||
    upload.userId === user?.id ||
    (!!user?.organizationId && upload.organizationId === user.organizationId);
  if (!allowed) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">{upload.originalFilename}</h1>
            <p className="text-xs text-muted-foreground">Case {upload.id}</p>
          </div>
        </div>
        {(user?.role === "ADMIN" || user?.role === "ENGINEER" || upload.userId === user?.id) && (
          <DeleteCaseButton uploadId={upload.id} />
        )}
      </div>
      <AnalysisNav uploadId={upload.id} />
      <div className="pt-2">{children}</div>
    </div>
  );
}
