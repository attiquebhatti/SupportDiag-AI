import { Rule, Finding, evidenceFrom } from "./types";

export const vpnRules: Rule[] = [
  {
    id: "VPN-001-IPSEC-DOWN",
    category: "VPN",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("ipsec-status")[0];
      if (!a) return [];
      const down = (a.dataJson.down as Array<{ name: string; state: string }>) ?? [];
      if (down.length === 0) return [];
      return [
        {
          ruleId: "VPN-001-IPSEC-DOWN",
          severity: "High",
          category: "VPN",
          title: "IPSec tunnel(s) down",
          description: `${down.length} IPSec tunnel(s) are not active.`,
          impact: "Down IPSec tunnels break site-to-site connectivity for the affected networks.",
          evidence: down.slice(0, 10).map((t) => evidenceFrom(a, `Tunnel ${t.name}: ${t.state}`)),
          recommendation: "Check peer reachability, matching IPSec/IKE crypto profiles, and proxy-IDs.",
          confidence: 74,
        },
      ];
    },
  },
  {
    id: "VPN-002-IKE-DOWN",
    category: "VPN",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("ike-status")[0];
      if (!a) return [];
      const down = (a.dataJson.down as Array<{ name: string; state: string }>) ?? [];
      if (down.length === 0) return [];
      return [
        {
          ruleId: "VPN-002-IKE-DOWN",
          severity: "High",
          category: "VPN",
          title: "IKE gateway(s) down",
          description: `${down.length} IKE gateway(s) are not established.`,
          impact: "Without IKE phase-1, dependent IPSec tunnels cannot come up.",
          evidence: down.slice(0, 10).map((g) => evidenceFrom(a, `IKE gateway ${g.name}: ${g.state}`)),
          recommendation: "Verify IKE version, pre-shared key/certificate, peer identity, and NAT-T settings.",
          confidence: 74,
        },
      ];
    },
  },
  {
    id: "VPN-003-TUNNEL-MONITOR-FAIL",
    category: "VPN",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("ipsec-status")[0];
      if (!a || !a.dataJson.monitorFailure) return [];
      return [
        {
          ruleId: "VPN-003-TUNNEL-MONITOR-FAIL",
          severity: "Medium",
          category: "VPN",
          title: "Tunnel monitor failure",
          description: "Tunnel monitoring reports a failed state for at least one tunnel.",
          impact: "Tunnel monitor failures can trigger failover or mark tunnels down even when IKE/IPSec is up.",
          evidence: [evidenceFrom(a, "Tunnel monitor: down/fail")],
          recommendation: "Verify the tunnel monitor destination IP is reachable across the tunnel and adjust monitor profile if needed.",
          confidence: 62,
        },
      ];
    },
  },
];
