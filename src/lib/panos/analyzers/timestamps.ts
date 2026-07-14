// PAN-OS log timestamp parsing + normalization.
//
// PAN-OS log families use several timestamp shapes and precisions. We normalize
// to ISO 8601 (UTC) and record the precision so the timeline can warn when a
// value is low-precision or a placeholder.

export interface ParsedTimestamp {
  raw: string;
  iso: string | null;
  precision: "high" | "second" | "minute" | "none";
}

// Placeholder/epoch-zero values seen in older versions.
const PLACEHOLDERS = [/^0000\/00\/00/, /1970-01-01/, /^0\s*$/];

const PATTERNS: Array<{ re: RegExp; precision: "high" | "second"; build: (m: RegExpMatchArray) => string }> = [
  // 2026/01/10 03:11:22.123456  (high resolution)
  {
    re: /(\d{4})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\.(\d{3,6})/,
    precision: "high",
    build: (m) => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7].slice(0, 3)}Z`,
  },
  // 2026/01/10 03:11:22
  {
    re: /(\d{4})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
    precision: "second",
    build: (m) => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`,
  },
  // 2026-01-10T03:11:22 / 2026-01-10 03:11:22
  {
    re: /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
    precision: "second",
    build: (m) => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`,
  },
  // Jan 10 03:11:22  (syslog style; year assumed from context, omitted → UTC current-year-agnostic)
  {
    re: /\b([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})/,
    precision: "second",
    build: (m) => {
      const months: Record<string, string> = {
        Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
        Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
      };
      const mm = months[m[1]] ?? "01";
      const dd = m[2].padStart(2, "0");
      // Year unknown in syslog format; use a neutral placeholder year so
      // ordering within the bundle still works but precision reflects the gap.
      return `1900-${mm}-${dd}T${m[3]}:${m[4]}:${m[5]}Z`;
    },
  },
];

export function parseTimestamp(line: string): ParsedTimestamp {
  if (PLACEHOLDERS.some((re) => re.test(line.trim()))) {
    return { raw: line.trim().slice(0, 40), iso: null, precision: "none" };
  }
  for (const p of PATTERNS) {
    const m = line.match(p.re);
    if (m) {
      const iso = p.build(m);
      const valid = !Number.isNaN(Date.parse(iso));
      return { raw: m[0], iso: valid ? iso : null, precision: p.precision };
    }
  }
  return { raw: "", iso: null, precision: "none" };
}

/** Chronological comparator for events; nulls sort last. */
export function byTimestamp(a: string | null, b: string | null): number {
  if (a && b) return a.localeCompare(b);
  if (a) return -1;
  if (b) return 1;
  return 0;
}
