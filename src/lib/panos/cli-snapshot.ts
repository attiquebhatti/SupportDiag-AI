// CLI snapshot (techsupport) parser.
//
// A PAN-OS TSF bundles the output of many `show …` commands into one large
// file (commonly tmp/cli/techsupport). Formatting varies between versions and
// platforms, so command boundaries are recognized FUZZILY rather than by one
// exact header format. Each recognized section becomes a virtual indexed file
// (path suffix ::<command-slug>) that downstream parsers consume like any
// other extracted file — instantly making the existing parser set TSF-aware.

export interface CliSection {
  command: string; // normalized command, e.g. "show system info"
  slug: string; // filesystem-safe id, e.g. "show-system-info"
  content: string;
  lineStart: number; // 1-based line in the source file
  lineEnd: number;
}

export interface CliSnapshot {
  sections: CliSection[];
  commandsFound: string[];
  unrecognizedHeader?: boolean;
}

// Commands we specifically care to index (fuzzy match by normalized prefix).
export const IMPORTANT_CLI_COMMANDS = [
  "show system info",
  "show system files",
  "show system software status",
  "show system resources",
  "show system disk-space",
  "show system environmentals",
  "show system state",
  "show jobs all",
  "show high-availability all",
  "show high-availability state",
  "show running resource-monitor",
  "show interface all",
  "show routing route",
  "show routing protocol bgp peer",
  "show routing protocol ospf neighbor",
  "show vpn ike-sa",
  "show vpn ipsec-sa",
  "show global-protect-gateway current-user",
  "show user ip-user-mapping",
  "show user group-mapping state",
  "show admins",
  "show config running",
];

/** Normalize whitespace/case of a command line. */
function normalizeCommand(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

export function commandSlug(command: string): string {
  return normalizeCommand(command).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Header shapes seen in the wild (fuzzy):
//   > show system info
//   admin@fw> show system info
//   --- show system info ---
//   *** show system info ***
//   ==== show system info ====
//   show system info            (bare, at start of line, followed by output)
const HEADER_PATTERNS: RegExp[] = [
  /^\s*(?:[\w.@-]+[>#]\s*)?>?\s*((?:show|request|debug)\s+[a-z][a-z0-9 ._\/-]*[a-z0-9])\s*$/i,
  /^\s*[-=*]{2,}\s*((?:show|request|debug)\s+[a-z][a-z0-9 ._\/-]*[a-z0-9])\s*[-=*]{2,}\s*$/i,
];

function matchHeader(line: string): string | null {
  // Cheap pre-filter before regex work.
  if (!/show|request|debug/i.test(line) || line.length > 200) return null;
  for (const re of HEADER_PATTERNS) {
    const m = line.match(re);
    if (m) {
      const cmd = normalizeCommand(m[1]);
      // Avoid treating narrative sentences as commands: require a known verb
      // and at most 8 words.
      if (cmd.split(" ").length <= 8) return cmd;
    }
  }
  return null;
}

/** Does this content look like a CLI techsupport dump? (≥3 command headers) */
export function looksLikeCliSnapshot(content: string): boolean {
  let hits = 0;
  const lines = content.split(/\r?\n/, 4000);
  for (const line of lines) {
    if (matchHeader(line)) {
      hits++;
      if (hits >= 3) return true;
    }
  }
  return false;
}

/** Split a techsupport dump into per-command sections (fuzzy headers). */
export function parseCliSnapshot(content: string): CliSnapshot {
  const lines = content.split(/\r?\n/);
  const sections: CliSection[] = [];
  let current: { command: string; start: number; buf: string[] } | null = null;

  const flush = (endLine: number) => {
    if (!current) return;
    const body = current.buf.join("\n").trim();
    if (body.length > 0) {
      sections.push({
        command: current.command,
        slug: commandSlug(current.command),
        content: body,
        lineStart: current.start,
        lineEnd: endLine,
      });
    }
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const cmd = matchHeader(lines[i]);
    if (cmd) {
      flush(i); // close previous section at the line before this header
      current = { command: cmd, start: i + 2, buf: [] };
    } else if (current) {
      current.buf.push(lines[i]);
    }
  }
  flush(lines.length);

  // De-duplicate repeated commands by keeping the longest output.
  const bySlug = new Map<string, CliSection>();
  for (const s of sections) {
    const prev = bySlug.get(s.slug);
    if (!prev || s.content.length > prev.content.length) bySlug.set(s.slug, s);
  }
  const deduped = [...bySlug.values()];

  return {
    sections: deduped,
    commandsFound: deduped.map((s) => s.command).sort(),
    unrecognizedHeader: deduped.length === 0,
  };
}

/**
 * Convert recognized sections into virtual indexed files for the parser
 * pipeline. Paths keep the source file plus ::slug so evidence links resolve.
 */
export function sectionsAsVirtualFiles(
  sourcePath: string,
  snapshot: CliSnapshot
): Array<{ path: string; content: string }> {
  return snapshot.sections.map((s) => ({
    path: `${sourcePath}::${s.slug}`,
    content: s.content,
  }));
}
