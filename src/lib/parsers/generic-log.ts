import { BaseParser, ParserArtifact } from "./types";

// Vendor-neutral fallback parser. Always runs; extracts generic error/warning
// signals and timestamped events so that even unrecognized bundles produce
// useful evidence and a timeline. Confidence for such analyses stays "low".

const TS_PATTERNS = [
  /\b\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}:\d{2}\b/, // 2024-01-02 03:04:05
  /\b[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\b/, // Jan  2 03:04:05
];

function extractTimestamp(line: string): string | null {
  for (const re of TS_PATTERNS) {
    const m = line.match(re);
    if (m) return m[0];
  }
  return null;
}

export const genericLogParser: BaseParser = {
  name: "generic-log",
  supportedPatterns: [],
  canParse(filePath) {
    return /\.(log|txt|json|out|err|messages)$/i.test(filePath) || !filePath.includes(".");
  },
  parse(filePath, content): ParserArtifact[] {
    const lines = content.split(/\r?\n/);
    const errors: Array<{ line: number; ts: string | null; text: string }> = [];
    let errorCount = 0;
    let warnCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isError = /\b(error|fatal|critical|panic|failed|failure|denied|crash)\b/i.test(line);
      const isWarn = /\b(warn|warning|deprecated|retry|timeout)\b/i.test(line);
      if (isError) errorCount++;
      if (isWarn) warnCount++;
      if (isError && errors.length < 40) {
        errors.push({ line: i + 1, ts: extractTimestamp(line), text: line.slice(0, 300) });
      }
    }

    if (errorCount === 0 && warnCount === 0) return [];
    return [
      {
        parserName: this.name,
        artifactType: "generic-log-scan",
        dataJson: { errorCount, warnCount, samples: errors },
        sourceFilePath: filePath,
      },
    ];
  },
};
