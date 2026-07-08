import { use } from "react";
import { GlobalSearch } from "@/components/global-search";

export default function SearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Search</h2>
      <p className="text-sm text-muted-foreground">
        Keyword or regex search across indexed text files. Matching lines are highlighted.
      </p>
      <GlobalSearch uploadId={id} />
    </div>
  );
}
