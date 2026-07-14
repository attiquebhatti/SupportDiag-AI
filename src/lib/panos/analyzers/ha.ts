import { Analyzer, AnalyzerContext, AnalyzerResult, DiagEvent, EnrichedFinding, Evidence } from "./types";
import { parseTimestamp } from "./timestamps";
import { filesOfFamily } from "./resource";

const HA_STATE_RE = /\b(active|passive|non-functional|suspended|initial|tentative)\b/i;

// Advanced HA analyzer (§13): HA state artifact + ha_agent.log correlation.
export const haAnalyzer: Analyzer = {
  id: "ha",
  run(ctx: AnalyzerContext): AnalyzerResult {
    const findings: EnrichedFinding[] = [];
    const events: DiagEvent[] = [];

    const ha = ctx.first("ha-status");
    if (!ha.enabled) return { findings, events };

    const localState = (ha.localState as string) ?? "";
    const peerState = (ha.peerState as string) ?? "";
    const runningSync = ((ha.runningSync as string) ?? (ha.configSync as string) ?? "").toLowerCase();

    // Build HA transition timeline from ha_agent.log + system.log.
    for (const fam of ["HA_AGENT_LOG", "SYSTEM_LOG"]) {
      for (const f of filesOfFamily(ctx, fam)) {
        const lines = (f.content as string).split(/\r?\n/);
        for (let i = 0; i < lines.length && events.length < 60; i++) {
          const line = lines[i];
          if (/ha|high[- ]availability/i.test(line) && (HA_STATE_RE.test(line) || /(failover|peer|split|keepalive|preempt)/i.test(line))) {
            const ts = parseTimestamp(line);
            const state = line.match(HA_STATE_RE)?.[1]?.toLowerCase();
            events.push({
              category: "HA",
              eventType: state ? `ha-state-${state}` : "ha-event",
              severity: /non-functional|suspended|split|down|lost/i.test(line) ? "High" : "Medium",
              rawTimestamp: ts.raw || null,
              normalizedTimestamp: ts.iso,
              precision: ts.precision,
              title: state ? `HA → ${state}` : "HA event",
              source: { filePath: f.path, line: i + 1, snippet: line.slice(0, 300) },
              correlationKeys: ["ha", ...(state ? [`ha-${state}`] : [])],
            });
          }
        }
      }
    }

    // Split-brain: both peers active (local active + peer active mentioned).
    const bothActive =
      /active/i.test(localState) &&
      (/active/i.test(peerState) || filesOfFamily(ctx, "HA_AGENT_LOG").some((f) => /split[- ]brain|both.*active/i.test(f.content as string)));
    if (bothActive) {
      const ev = filesOfFamily(ctx, "HA_AGENT_LOG").flatMap((f) =>
        (f.content as string).split(/\r?\n/).map((l, i) => ({ f: f.path, i: i + 1, l })).filter((x) => /split[- ]brain|both.*active/i.test(x.l))
      );
      findings.push({
        ruleId: "HA-SPLIT-BRAIN",
        category: "High Availability",
        severity: "Critical",
        title: "Possible HA split-brain (both peers active)",
        summary: "Evidence suggests both HA peers were in the active state simultaneously.",
        technicalImpact: "Split-brain causes duplicate active devices, MAC/IP conflicts, asymmetric traffic, and session disruption.",
        recommendation:
          "Verify HA1 control-link connectivity between peers (this is the usual trigger), confirm election settings, and compare both peers' ha_agent.log timelines (upload the peer TSF for comparison).",
        confidence: 65,
        evidence: ev.slice(0, 4).map((x): Evidence => ({ filePath: x.f, line: x.i, snippet: x.l.slice(0, 300) })),
        details: { probableCause: "HA1 control-link loss leading to independent active election.", knownIssuePossibility: "See Known Issues → HA1 port mapping family." },
      });
    }

    // Suspended / non-functional local state.
    if (/suspended|non-functional/i.test(localState)) {
      findings.push({
        ruleId: "HA-LOCAL-DEGRADED",
        category: "High Availability",
        severity: "High",
        title: `Local HA state is ${localState}`,
        summary: `The local device reports HA state "${localState}".`,
        technicalImpact: "A suspended/non-functional device does not process traffic in the pair, removing redundancy or capacity.",
        recommendation: "Determine why the device entered this state (manual, preemption, monitoring failure) and restore it once healthy.",
        confidence: 80,
        evidence: [{ filePath: "show high-availability state", snippet: `Local state: ${localState}` }],
        details: { probableCause: "Monitoring failure or manual suspension." },
      });
    }

    // Config out of sync (richer than baseline: adds correlation hint).
    const outOfSync = runningSync && /not synchronized|not sync|out of sync|mismatch/i.test(runningSync);
    if (outOfSync) {
      findings.push({
        ruleId: "HA-CONFIG-OUT-OF-SYNC",
        category: "High Availability",
        severity: "High",
        title: "HA configuration not synchronized",
        summary: `HA running-config sync status is "${runningSync}".`,
        technicalImpact: "Config drift between peers can cause inconsistent policy enforcement after failover.",
        recommendation: "Run an HA config sync from the active peer and resolve any commit differences; confirm both peers run matching PAN-OS and content versions.",
        confidence: 80,
        evidence: [{ filePath: "show high-availability all", snippet: `Running sync: ${runningSync}` }],
        details: { probableCause: "Unsynced config, or version/content mismatch blocking sync.", alternativeCauses: ["Pending commit on one peer", "HA1 instability interrupting sync"] },
      });
    }

    // Peer down.
    if (/down|unknown|non-functional/i.test(peerState) && !/up|passive|active/i.test(peerState)) {
      findings.push({
        ruleId: "HA-PEER-DOWN",
        category: "High Availability",
        severity: "Critical",
        title: "HA peer is down",
        summary: `Peer HA state is "${peerState}".`,
        technicalImpact: "With the peer down the cluster has no redundancy; a failure of this unit would cause an outage.",
        recommendation: "Verify HA links (HA1/HA2), peer power/state, and heartbeat connectivity between the units.",
        confidence: 82,
        evidence: [{ filePath: "show high-availability state", snippet: `Peer state: ${peerState}` }],
        details: { probableCause: "Peer offline or control-link loss.", knownIssuePossibility: "See Known Issues → HA1 port mapping / HA2-HSCI families." },
      });
    }

    return { findings, events };
  },
};
