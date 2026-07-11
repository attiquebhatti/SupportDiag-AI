import { FileExplorer } from "@/components/file-explorer";

export default async function FilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ path?: string }>;
}) {
  const { id } = await params;
  const { path } = await searchParams;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Evidence Explorer</h2>
      <FileExplorer uploadId={id} initialPath={path} />
    </div>
  );
}
