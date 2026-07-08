import type { ParserArtifact } from "../parsers/types";

export type Severity = "Critical" | "High" | "Medium" | "Low" | "Informational";

export interface Evidence {
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  snippet: string;
}

export interface Finding {
  ruleId: string;
  severity: Severity;
  category: string;
  title: string;
  description: string;
  impact: string;
  evidence: Evidence[];
  recommendation: string;
  confidence: number; // 0-100
}

export interface RuleContext {
  artifacts: ParserArtifact[];
  /** All artifacts of a given type. */
  byType(type: string): ParserArtifact[];
  /** First artifact data of a given type, or {}. */
  first(type: string): Record<string, unknown>;
  /** All artifact data of a given type. */
  all(type: string): Record<string, unknown>[];
}

export interface Rule {
  id: string;
  category: string;
  /** Evaluate the context and return zero or more findings. */
  evaluate(ctx: RuleContext): Finding[];
}

/** Build an evidence entry pointing at a parsed artifact source. */
export function evidenceFrom(
  artifact: ParserArtifact | undefined,
  snippet: string
): Evidence {
  return {
    filePath: artifact?.sourceFilePath ?? "(derived)",
    snippet,
  };
}
