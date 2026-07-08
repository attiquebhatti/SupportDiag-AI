import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const SEVERITY_META: Record<
  string,
  { label: string; className: string; order: number }
> = {
  CRITICAL: { label: "Critical", className: "bg-critical/15 text-critical border-critical/30", order: 0 },
  HIGH: { label: "High", className: "bg-high/15 text-high border-high/30", order: 1 },
  MEDIUM: { label: "Medium", className: "bg-medium/15 text-medium border-medium/30", order: 2 },
  LOW: { label: "Low", className: "bg-low/15 text-low border-low/30", order: 3 },
  INFORMATIONAL: { label: "Info", className: "bg-info/15 text-info border-info/30", order: 4 },
};
