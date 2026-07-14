import { Analyzer, AnalyzerContext, AnalyzerResult, DiagEvent, EnrichedFinding, Evidence } from "./types";
import { filesOfFamily } from "./resource";

interface PortCounters {
  name: string;
  crc?: number;
  fcs?: number;
  inputErrors?: number;
  outputErrors?: number;
  align?: number;
  drops?: number;
}

// Parse sdb.txt / interface counter output for physical error counters.
function parseCounters(text: string): PortCounters[] {
  const ports = new Map<string, PortCounters>();
  const lines = text.split(/\r?\n/);
  let current: string | null = null;
  for (const line of lines) {
    const nameMatch = line.match(/\b(ethernet\d+\/\d+|ae\d+|hsci|ha\d?)\b/i);
    if (nameMatch) current = nameMatch[1].toLowerCase();
    if (!current) continue;
    const p = ports.get(current) ?? { name: current };
    const grab = (re: RegExp) => {
      const m = line.match(re);
      return m ? parseInt(m[1], 10) : undefined;
    };
    p.crc = grab(/crc[- ]?errors?\D+(\d+)/i) ?? p.crc;
    p.fcs = grab(/fcs[- ]?errors?\D+(\d+)/i) ?? p.fcs;
    p.inputErrors = grab(/(?:in|rx|input)[- ]?errors?\D+(\d+)/i) ?? p.inputErrors;
    p.outputErrors = grab(/(?:out|tx|output)[- ]?errors?\D+(\d+)/i) ?? p.outputErrors;
    p.align = grab(/align(?:ment)?[- ]?errors?\D+(\d+)/i) ?? p.align;
    p.drops = grab(/drops?\D+(\d+)/i) ?? p.drops;
    ports.set(current, p);
  }
  return [...ports.values()];
}

function total(p: PortCounters): number {
  return (p.crc ?? 0) + (p.fcs ?? 0) + (p.inputErrors ?? 0) + (p.outputErrors ?? 0) + (p.align ?? 0);
}

// Interface health analyzer (§14): sdb.txt + interface state → physical-layer clues.
export const interfaceAnalyzer: Analyzer = {
  id: "interface",
  run(ctx: AnalyzerContext): AnalyzerResult {
    const findings: EnrichedFinding[] = [];
    const events: DiagEvent[] = [];

    const sdbFiles = [...filesOfFamily(ctx, "SDB"), ...ctx.files.filter((f) => f.content && /::show-interface/.test(f.path))];
    const counters: PortCounters[] = [];
    const evidenceByPort = new Map<string, Evidence>();
    for (const f of sdbFiles) {
      for (const p of parseCounters(f.content as string)) {
        counters.push(p);
        if (!evidenceByPort.has(p.name)) evidenceByPort.set(p.name, { filePath: f.path, snippet: `${p.name}: CRC=${p.crc ?? 0} FCS=${p.fcs ?? 0} inErr=${p.inputErrors ?? 0}` });
      }
    }

    const errored = counters.filter((p) => total(p) > 100);
    if (errored.length > 0) {
      for (const p of errored) {
        events.push({
          category: "Interface", eventType: "error-counters", severity: "Medium",
          rawTimestamp: null, normalizedTimestamp: null, precision: "none",
          title: `${p.name} error counters`, source: evidenceByPort.get(p.name)!, correlationKeys: ["interface", p.name],
        });
      }
      const crcHeavy = errored.some((p) => (p.crc ?? 0) > 100 || (p.fcs ?? 0) > 100);
      findings.push({
        ruleId: "IF-ERROR-COUNTERS",
        category: "Interfaces",
        severity: "Medium",
        title: "Interface error counters detected",
        summary: `${errored.length} interface(s) show elevated error counters: ${errored.map((p) => `${p.name} (${total(p)})`).join(", ")}.`,
        technicalImpact: "Interface errors (CRC/FCS/input) cause retransmissions, latency, and throughput loss; on HA links they can trigger failovers.",
        recommendation:
          "This strongly indicates a physical-layer issue but requires remote-side verification. Inspect cabling/transceivers/fiber, confirm speed & duplex match on both ends, and compare against the peer switch's counters.",
        confidence: 68,
        evidence: errored.slice(0, 5).map((p) => evidenceByPort.get(p.name)!).filter(Boolean),
        details: {
          plane: errored.some((p) => /hsci|ha/.test(p.name)) ? "cp" : "dp",
          probableCause: crcHeavy ? "Possible physical-layer fault (CRC/FCS errors) — cable/SFP/fiber." : "Interface errors consistent with a link or configuration issue.",
          alternativeCauses: ["Speed/duplex mismatch", "MTU mismatch", "Remote-side hardware issue", "Failing transceiver"],
        },
      });
    }

    // Link flaps from interface logs / state.
    const flaps = filesOfFamily(ctx, "SYSTEM_LOG").flatMap((f) =>
      (f.content as string).split(/\r?\n/).map((l, i) => ({ f: f.path, i: i + 1, l })).filter((x) => /(ethernet\d+\/\d+|ae\d+).*(link (down|flap)|state changed)/i.test(x.l))
    );
    if (flaps.length >= 3) {
      findings.push({
        ruleId: "IF-LINK-FLAP",
        category: "Interfaces",
        severity: "Medium",
        title: "Interface link flapping",
        summary: `${flaps.length} interface link-state change event(s) were found in the system log.`,
        technicalImpact: "Repeated link flaps disrupt traffic and, on HA/monitored links, can cause failovers or path-monitoring failures.",
        recommendation: "Identify the flapping interface(s), check the physical path and remote switch port, and review autonegotiation settings. Requires remote-side verification.",
        confidence: 62,
        evidence: flaps.slice(0, 4).map((x): Evidence => ({ filePath: x.f, line: x.i, snippet: x.l.slice(0, 300) })),
        details: { plane: "dp", probableCause: "Possible physical-layer fault or unstable remote port." },
      });
    }

    return { findings, events };
  },
};
