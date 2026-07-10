import { redirect } from "next/navigation";
import { Eye } from "lucide-react";
import { config } from "@/lib/config";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { UploadWizard } from "@/components/upload-wizard";

export const dynamic = "force-dynamic";

// Server wrapper: passes the configured upload limit (MAX_UPLOAD_SIZE_MB) to
// the client wizard so the UI always reflects the deployment's real limit.
// Viewers are read-only and cannot start new analyses.
export default async function UploadPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canWrite(user.role)) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <Eye className="h-8 w-8 text-muted-foreground" />
        <h1 className="font-semibold">Read-only access</h1>
        <p className="px-6 text-sm text-muted-foreground">
          Your role (Viewer) can browse cases, findings, and reports, but cannot start new
          analyses. Ask a workspace admin to upgrade your role.
        </p>
      </div>
    );
  }
  return <UploadWizard maxUploadMb={config.limits.maxUploadMb} />;
}
