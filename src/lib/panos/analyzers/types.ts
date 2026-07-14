// Shared types for the PAN-OS deep-analyzer layer.
//
// Analyzers run AFTER parsing. They consume normalized artifacts + raw evidence
// and produce (1) enriched, evidence-linked findings and (2) structured
// diagnostic events that feed the correlation engine and the timeline.

export type Plane = "mp" | "dp" | "cp" | "system";
export type Severity = "Critical" | "High" | "Medium" | "Low" | "Informational";

export interface Evidence {
  filePath: string;
  line?: number;
  snippet: string;
}

export interface DiagEvent {
  category: string; // OOM | Reboot | Process | Crash | HA | Interface | Commit | Resource
  eventType: string;
  severity: Severity;
  rawTimestamp: string | null;
  normalizedTimestamp: string | null; // ISO 8601 (UTC) when parseable
  precision: "high" | "second" | "minute" | "none";
  title: string;
  source: Evidence;
  /** Keys used to correlate this event with others (process, ip, session…). */
  correlationKeys: string[];
}

export interface FindingDetails {
  plane?: Plane;
  affectedProcess?: string;
  probableCause?: string;
  alternativeCauses?: string[];
  knownIssuePossibility?: string;
  /** Human-readable correlation notes attached during correlation. */
  correlation?: string[];
}

export interface EnrichedFinding {
  ruleId: string;
  category: string;
  severity: Severity;
  title: string;
  summary: string; // → Finding.description
  technicalImpact: string; // → Finding.impact
  recommendation: string;
  confidence: number; // 0-100
  evidence: Evidence[];
  details: FindingDetails;
}

export interface AnalyzerContext {
  version: string | null;
  /** All artifacts of a given artifactType. */
  byType(type: string): Array<{ dataJson: Record<string, unknown>; sourceFilePath: string | null }>;
  /** First artifact data of a type, or {}. */
  first(type: string): Record<string, unknown>;
  /** All indexed files (including CLI-expanded virtual files). */
  files: Array<{ path: string; content: string | null }>;
  /** Logical artifact families present (from the manifest). */
  manifestFamilies: string[];
}

export interface AnalyzerResult {
  findings: EnrichedFinding[];
  events: DiagEvent[];
}

export interface Analyzer {
  id: string;
  run(ctx: AnalyzerContext): AnalyzerResult;
}
