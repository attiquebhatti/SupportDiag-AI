import type { ParserArtifact } from "../../parsers/types";
import { Analyzer, AnalyzerContext, AnalyzerResult, DiagEvent, EnrichedFinding } from "./types";
import { resourceAnalyzer } from "./resource";
import { crashAnalyzer } from "./crash";
import { commitAnalyzer } from "./commit";
import { haAnalyzer } from "./ha";
import { interfaceAnalyzer } from "./interface";
import { correlate, type CorrelationGroup } from "./correlate";

export * from "./types";
export { correlate } from "./correlate";

export const ANALYZERS: Analyzer[] = [
  resourceAnalyzer,
  crashAnalyzer,
  commitAnalyzer,
  haAnalyzer,
  interfaceAnalyzer,
];

function buildContext(
  artifacts: ParserArtifact[],
  files: Array<{ path: string; content: string | null }>,
  version: string | null,
  manifestFamilies: string[]
): AnalyzerContext {
  return {
    version,
    files,
    manifestFamilies,
    byType: (type) =>
      artifacts.filter((a) => a.artifactType === type).map((a) => ({ dataJson: a.dataJson, sourceFilePath: a.sourceFilePath })),
    first: (type) => artifacts.find((a) => a.artifactType === type)?.dataJson ?? {},
  };
}

export interface DeepAnalysisResult {
  findings: EnrichedFinding[];
  events: DiagEvent[];
  correlationGroups: CorrelationGroup[];
}

/** Run all PAN-OS deep analyzers, then correlate events + annotate findings. */
export function runDeepAnalysis(
  artifacts: ParserArtifact[],
  files: Array<{ path: string; content: string | null }>,
  version: string | null,
  manifestFamilies: string[]
): DeepAnalysisResult {
  const ctx = buildContext(artifacts, files, version, manifestFamilies);
  const allFindings: EnrichedFinding[] = [];
  const allEvents: DiagEvent[] = [];

  for (const analyzer of ANALYZERS) {
    let result: AnalyzerResult;
    try {
      result = analyzer.run(ctx);
    } catch {
      continue; // isolate analyzer failures
    }
    allFindings.push(...result.findings);
    allEvents.push(...result.events);
  }

  const { groups, findings } = correlate(allEvents, allFindings);

  const sevOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Informational: 4 };
  findings.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return { findings, events: allEvents, correlationGroups: groups };
}
