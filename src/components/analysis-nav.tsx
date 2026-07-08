"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AnalysisNav({ uploadId }: { uploadId: string }) {
  const pathname = usePathname();
  const base = `/uploads/${uploadId}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/findings`, label: "Findings" },
    { href: `${base}/files`, label: "File Explorer" },
    { href: `${base}/search`, label: "Search" },
    { href: `${base}/ai`, label: "AI Assistant" },
    { href: `${base}/report`, label: "Report" },
  ];
  return (
    <div className="flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => {
        const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
