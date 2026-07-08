// Modular parser framework. Each parser inspects an extracted text file and
// produces zero or more structured artifacts stored as ParsedArtifact rows.

export interface ParserArtifact {
  parserName: string;
  artifactType: string;
  dataJson: Record<string, unknown>;
  sourceFilePath: string;
}

export interface ParserInput {
  filePath: string;
  content: string;
}

export interface BaseParser {
  name: string;
  /** Glob-ish substrings / regex source strings matched against the file path. */
  supportedPatterns: string[];
  canParse(filePath: string, content: string): boolean;
  parse(filePath: string, content: string): ParserArtifact[];
}

/** Case-insensitive helper: does the path match any of the supplied patterns? */
export function pathMatchesAny(filePath: string, patterns: string[]): boolean {
  const lower = filePath.toLowerCase();
  return patterns.some((p) => {
    const pat = p.toLowerCase();
    if (pat.includes("*") || pat.includes("\\") || pat.includes("+")) {
      try {
        return new RegExp(pat).test(lower);
      } catch {
        return lower.includes(pat.replace(/[*\\+]/g, ""));
      }
    }
    return lower.includes(pat);
  });
}

/** Extract "key: value" pairs from key/value style CLI output. */
export function parseKeyValues(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z0-9 _.\-\/]*?)\s*:\s*(.+?)\s*$/);
    if (m) {
      const key = m[1].trim().toLowerCase().replace(/\s+/g, "_");
      if (!(key in out)) out[key] = m[2].trim();
    }
  }
  return out;
}

export function firstMatch(content: string, regex: RegExp): string | null {
  const m = content.match(regex);
  return m ? m[1] ?? m[0] : null;
}
