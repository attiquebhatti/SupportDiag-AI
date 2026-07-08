import type { Finding, Severity } from "./rules/types";

const SEVERITY_PENALTY: Record<Severity, number> = {
  Critical: 15,
  High: 8,
  Medium: 4,
  Low: 1,
  Informational: 0,
};

export interface HealthBand {
  label: string;
  color: string; // tailwind-friendly token
}

export function computeHealthScore(findings: Pick<Finding, "severity">[]): number {
  let score = 100;
  for (const f of findings) score -= SEVERITY_PENALTY[f.severity] ?? 0;
  return Math.max(0, Math.min(100, score));
}

export function healthBand(score: number): HealthBand {
  if (score >= 90) return { label: "Healthy", color: "low" };
  if (score >= 75) return { label: "Minor Issues", color: "medium" };
  if (score >= 50) return { label: "Needs Attention", color: "medium" };
  if (score >= 25) return { label: "Degraded", color: "high" };
  return { label: "Critical", color: "critical" };
}

export function countBySeverity(findings: Pick<Finding, "severity">[]) {
  const counts: Record<Severity, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
    Informational: 0,
  };
  for (const f of findings) counts[f.severity]++;
  return counts;
}
