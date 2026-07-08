import { Rule, Finding, evidenceFrom } from "./types";

export const interfaceRules: Rule[] = [
  {
    id: "IF-001-PHYS-DOWN",
    category: "Interfaces",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("interface-status")[0];
      if (!a) return [];
      const down = (a.dataJson.down as string[]) ?? [];
      const physDown = down.filter((n) => /^ethernet|^ae\d/i.test(n));
      if (physDown.length === 0) return [];
      return [
        {
          ruleId: "IF-001-PHYS-DOWN",
          severity: "Medium",
          category: "Interfaces",
          title: "Physical interface(s) down",
          description: `${physDown.length} physical interface(s) are down: ${physDown.join(", ")}.`,
          impact: "Down data interfaces may indicate cabling, SFP, or upstream issues affecting connectivity.",
          evidence: physDown.map((n) => evidenceFrom(a, `Interface ${n}: down`)),
          recommendation: "Confirm whether the interfaces are intentionally unused. If in use, check transceivers, cabling and peer ports.",
          confidence: 65,
        },
      ];
    },
  },
  {
    id: "IF-002-ERROR-COUNTERS",
    category: "Interfaces",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("interface-status")[0];
      if (!a) return [];
      const withErrors = (a.dataJson.withErrors as Array<{ name: string; errors: number }>) ?? [];
      const significant = withErrors.filter((i) => i.errors > 100);
      if (significant.length === 0) return [];
      return [
        {
          ruleId: "IF-002-ERROR-COUNTERS",
          severity: "Medium",
          category: "Interfaces",
          title: "Interface error counters detected",
          description: `${significant.length} interface(s) show elevated error counters.`,
          impact: "Interface errors (CRC, drops) can cause retransmissions, latency and throughput loss.",
          evidence: significant.map((i) => evidenceFrom(a, `${i.name}: ${i.errors} errors`)),
          recommendation: "Inspect physical media, duplex/speed settings and upstream switch counters for the affected ports.",
          confidence: 68,
        },
      ];
    },
  },
  {
    id: "IF-003-ZONE-MISSING",
    category: "Interfaces",
    evaluate(ctx): Finding[] {
      const ifs = ctx.byType("interface-status")[0];
      const zones = ctx.byType("zones")[0];
      if (!ifs || !zones) return [];
      const zoneList = (zones.dataJson.zones as string[]) ?? [];
      // Informational: no zones configured while active interfaces exist.
      const upCount = ((ifs.dataJson.interfaces as Array<{ up: boolean }>) ?? []).filter((i) => i.up).length;
      if (zoneList.length > 0 || upCount === 0) return [];
      return [
        {
          ruleId: "IF-003-ZONE-MISSING",
          severity: "Low",
          category: "Interfaces",
          title: "No security zones detected on active configuration",
          description: "Active interfaces are present but no security zones were parsed from the configuration.",
          impact: "Interfaces without a zone cannot pass firewalled traffic and policy will not apply.",
          evidence: [evidenceFrom(ifs, `${upCount} active interface(s), 0 zones parsed`)],
          recommendation: "Verify that data interfaces are assigned to the correct security zones.",
          confidence: 45,
        },
      ];
    },
  },
];
