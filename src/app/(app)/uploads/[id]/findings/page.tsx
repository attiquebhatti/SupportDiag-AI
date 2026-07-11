import { use } from "react";
import { FindingsTable } from "@/components/findings-table";

export default function FindingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Diagnostic Findings</h2>
      <FindingsTable uploadId={id} />
    </div>
  );
}
