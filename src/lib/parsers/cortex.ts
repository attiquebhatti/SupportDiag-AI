import { BaseParser, ParserArtifact } from "./types";

// Cortex XDR / XSIAM log bundles vary widely in structure. These parsers use
// flexible keyword + JSON/text scanning to extract evidence generically, so the
// tool remains useful even when the exact bundle layout is unknown.

interface KeywordGroup {
  artifactType: string;
  keywords: RegExp;
  errorOnly?: boolean;
}

const XDR_GROUPS: KeywordGroup[] = [
  { artifactType: "cortex-agent", keywords: /(agent).*(disconnect|not connected|unregister|offline|connectivity|failed to connect)/i },
  { artifactType: "cortex-broker", keywords: /broker\s*vm.*(down|error|disconnect|unreachable|fail)/i },
  { artifactType: "cortex-collector", keywords: /(collector|ingest).*(error|fail|drop|backlog)/i },
  { artifactType: "cortex-content", keywords: /content.*(update|version).*(fail|error|outdated)/i },
  { artifactType: "cortex-policy", keywords: /(policy|profile).*(error|invalid|fail)/i },
  { artifactType: "cortex-service", keywords: /(service|daemon|cyserver|traps).*(restart|crash|stopped|respawn)/i },
  { artifactType: "cortex-auth", keywords: /(auth|token|certificate|integration).*(fail|error|expired|invalid)/i },
];

const XSIAM_GROUPS: KeywordGroup[] = [
  { artifactType: "xsiam-ingestion", keywords: /(ingest|data\s*source|log\s*source).*(error|fail|drop|delay|backlog|unhealthy)/i },
  { artifactType: "xsiam-parsing", keywords: /parsing\s*rule.*(error|fail|invalid)/i },
  { artifactType: "xsiam-correlation", keywords: /correlation\s*rule.*(error|fail|invalid)/i },
  { artifactType: "xsiam-dataset", keywords: /dataset.*(error|fail|missing|invalid)/i },
  { artifactType: "xsiam-xql", keywords: /xql.*(error|fail|syntax|invalid)/i },
  { artifactType: "xsiam-collector", keywords: /(broker|collector).*(down|error|disconnect|unhealthy)/i },
];

function scanGroups(content: string, groups: KeywordGroup[], parserName: string, filePath: string): ParserArtifact[] {
  const lines = content.split(/\r?\n/);
  const artifacts: ParserArtifact[] = [];
  for (const g of groups) {
    const matches = lines.filter((l) => g.keywords.test(l));
    if (matches.length === 0) continue;
    artifacts.push({
      parserName,
      artifactType: g.artifactType,
      dataJson: { count: matches.length, samples: matches.slice(0, 10) },
      sourceFilePath: filePath,
    });
  }
  return artifacts;
}

export const cortexXdrParser: BaseParser = {
  name: "cortex-xdr",
  supportedPatterns: ["xdr", "traps", "cyserver", "broker", "agent"],
  canParse(filePath, content) {
    return /cortex|xdr|traps|cyserver|broker\s*vm/i.test(filePath + "\n" + content.slice(0, 4000));
  },
  parse(filePath, content) {
    return scanGroups(content, XDR_GROUPS, this.name, filePath);
  },
};

export const cortexXsiamParser: BaseParser = {
  name: "cortex-xsiam",
  supportedPatterns: ["xsiam", "xql", "dataset", "ingest", "collector"],
  canParse(filePath, content) {
    return /xsiam|xql|dataset|ingest|correlation rule|parsing rule/i.test(filePath + "\n" + content.slice(0, 4000));
  },
  parse(filePath, content) {
    return scanGroups(content, XSIAM_GROUPS, this.name, filePath);
  },
};
