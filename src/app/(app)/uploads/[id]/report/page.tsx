import { use } from "react";
import { ReportGenerator } from "@/components/report-generator";

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Report</h2>
      <ReportGenerator uploadId={id} />
    </div>
  );
}
