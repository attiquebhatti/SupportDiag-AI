import { config } from "@/lib/config";
import { UploadWizard } from "@/components/upload-wizard";

export const dynamic = "force-dynamic";

// Server wrapper: passes the configured upload limit (MAX_UPLOAD_SIZE_MB) to
// the client wizard so the UI always reflects the deployment's real limit.
export default function UploadPage() {
  return <UploadWizard maxUploadMb={config.limits.maxUploadMb} />;
}
