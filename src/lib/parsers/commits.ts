import { BaseParser, ParserArtifact, pathMatchesAny } from "./types";

// Commit logs (`show log config` / commit history).
export const commitLogParser: BaseParser = {
  name: "commit-logs",
  supportedPatterns: ["commit", "config_log", "job_log", "show_jobs"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns) && /commit|job/i.test(content)) return true;
    return /commit\s+(?:succeeded|failed|OK)/i.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    const lines = content.split(/\r?\n/).filter((l) => /commit|validation/i.test(l));
    const failed = lines.filter((l) => /fail|error/i.test(l));
    const lastLine = lines[lines.length - 1] ?? null;
    let lastStatus: string | null = null;
    if (lastLine) {
      if (/fail|error/i.test(lastLine)) lastStatus = "failed";
      else if (/succeed|ok|completed/i.test(lastLine)) lastStatus = "succeeded";
    }
    const validationError = /validation\s+(?:error|failed)/i.test(content);
    return [
      {
        parserName: this.name,
        artifactType: "commit-logs",
        dataJson: {
          lastStatus,
          failedCount: failed.length,
          validationError,
          recentFailures: failed.slice(-5),
        },
        sourceFilePath: filePath,
      },
    ];
  },
};
