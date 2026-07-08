import { Rule, Finding, evidenceFrom } from "./types";

function haData(ctx: { byType(t: string): Array<{ dataJson: Record<string, unknown>; sourceFilePath?: string }> }) {
  return ctx.byType("ha-status")[0];
}

export const haRules: Rule[] = [
  {
    id: "HA-001-PEER-DOWN",
    category: "High Availability",
    evaluate(ctx): Finding[] {
      const a = haData(ctx);
      if (!a || !a.dataJson.enabled) return [];
      const peer = (a.dataJson.peerState as string) ?? "";
      if (!peer || /up|passive|active|non-functional$/i.test(peer) === false && !/down|unknown|non-functional/i.test(peer)) {
        // only flag when clearly down
      }
      if (!/down|unknown|non-functional/i.test(peer)) return [];
      return [
        {
          ruleId: "HA-001-PEER-DOWN",
          severity: "Critical",
          category: "High Availability",
          title: "HA peer is down",
          description: `The HA peer state is reported as "${peer}".`,
          impact: "With the peer down the cluster has no redundancy; a failure of this unit would cause an outage.",
          evidence: [evidenceFrom(a as never, `Peer state: ${peer}`)],
          recommendation: "Verify HA links, peer power/state, and heartbeat connectivity between the units.",
          confidence: 82,
        },
      ];
    },
  },
  {
    id: "HA-002-CONFIG-NOT-SYNCED",
    category: "High Availability",
    evaluate(ctx): Finding[] {
      const a = haData(ctx);
      if (!a || !a.dataJson.enabled) return [];
      const sync = ((a.dataJson.runningSync as string) ?? (a.dataJson.configSync as string) ?? "").toLowerCase();
      if (!sync) return [];
      // "not synchronized" contains "synchronized", so test the negative first.
      const outOfSync = /not synchronized|not sync|out of sync|mismatch|unsynced/i.test(sync);
      if (!outOfSync) return [];
      return [
        {
          ruleId: "HA-002-CONFIG-NOT-SYNCED",
          severity: "High",
          category: "High Availability",
          title: "HA configuration not synchronized",
          description: `HA running config sync status is "${sync}".`,
          impact: "Config drift between peers can cause inconsistent policy enforcement after failover.",
          evidence: [evidenceFrom(a as never, `Running sync: ${sync}`)],
          recommendation: "Run an HA config sync from the active peer and resolve any commit differences.",
          confidence: 80,
        },
      ];
    },
  },
  {
    id: "HA-003-PATH-MONITOR-FAIL",
    category: "High Availability",
    evaluate(ctx): Finding[] {
      const a = haData(ctx);
      if (!a || !a.dataJson.enabled) return [];
      const pm = ((a.dataJson.pathMonitorStatus as string) ?? "").toLowerCase();
      if (!/down|fail/i.test(pm)) return [];
      return [
        {
          ruleId: "HA-003-PATH-MONITOR-FAIL",
          severity: "High",
          category: "High Availability",
          title: "HA path monitoring failure",
          description: `HA path monitoring status is "${pm}".`,
          impact: "Path monitoring failures can trigger unnecessary failovers or indicate upstream reachability problems.",
          evidence: [evidenceFrom(a as never, `Path monitoring: ${pm}`)],
          recommendation: "Verify monitored destinations are reachable and tune path-monitoring thresholds if flapping.",
          confidence: 75,
        },
      ];
    },
  },
  {
    id: "HA-004-LINK-FAIL",
    category: "High Availability",
    evaluate(ctx): Finding[] {
      const a = haData(ctx);
      if (!a || !a.dataJson.enabled) return [];
      const lm = ((a.dataJson.linkMonitorStatus as string) ?? "").toLowerCase();
      if (!/down|fail/i.test(lm)) return [];
      return [
        {
          ruleId: "HA-004-LINK-FAIL",
          severity: "High",
          category: "High Availability",
          title: "HA link failure",
          description: `HA link monitoring status is "${lm}".`,
          impact: "A failed monitored link can force a failover and reduce redundancy.",
          evidence: [evidenceFrom(a as never, `Link monitoring: ${lm}`)],
          recommendation: "Check the monitored interface(s), cabling, and upstream switch ports.",
          confidence: 75,
        },
      ];
    },
  },
  {
    id: "HA-005-SUSPENDED",
    category: "High Availability",
    evaluate(ctx): Finding[] {
      const a = haData(ctx);
      if (!a || !a.dataJson.enabled) return [];
      if (!a.dataJson.suspended) return [];
      return [
        {
          ruleId: "HA-005-SUSPENDED",
          severity: "Critical",
          category: "High Availability",
          title: "Device is in suspended HA state",
          description: `The local HA state is "${(a.dataJson.localState as string) ?? "suspended"}".`,
          impact: "A suspended device does not process traffic in the HA pair, removing redundancy or capacity.",
          evidence: [evidenceFrom(a as never, `Local state: ${(a.dataJson.localState as string) ?? "suspended"}`)],
          recommendation: "Determine why the device was suspended (manual, preemption, or fault) and restore it once healthy.",
          confidence: 85,
        },
      ];
    },
  },
];
