import { cn } from "@/lib/utils";

// Neutral shield + lens/radar mark. No vendor logos are used anywhere.
export function BrandLogo({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-600 shadow-lg shadow-primary/20", className)}>
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white" aria-hidden>
        <path d="M12 2 4 5v6c0 4.5 3.2 7.9 8 9 4.8-1.1 8-4.5 8-9V5l-8-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="12" cy="11" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="m14.2 13.2 2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </div>
  );
}
