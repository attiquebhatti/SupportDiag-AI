import { Rule, Finding, evidenceFrom } from "./types";

export const routingRules: Rule[] = [
  {
    id: "RT-001-NO-DEFAULT-ROUTE",
    category: "Routing",
    evaluate(ctx): Finding[] {
      const rt = ctx.byType("routing-table")[0];
      const staticR = ctx.byType("static-routes")[0];
      const hasRoutingTable = !!rt;
      const hasDefault =
        (rt?.dataJson?.hasDefaultRoute as boolean) ||
        (staticR?.dataJson?.hasDefaultRoute as boolean);
      if (!hasRoutingTable && !staticR) return [];
      if (hasDefault) return [];
      return [
        {
          ruleId: "RT-001-NO-DEFAULT-ROUTE",
          severity: "High",
          category: "Routing",
          title: "Missing default route",
          description: "No default route (0.0.0.0/0) was found in the routing/config data.",
          impact: "Without a default route, traffic to unknown destinations (e.g. internet) will be dropped.",
          evidence: [evidenceFrom(rt ?? staticR, "No 0.0.0.0/0 route present")],
          recommendation: "Confirm a default route exists in the appropriate virtual router, or that this is intentional for the design.",
          confidence: 60,
        },
      ];
    },
  },
  {
    id: "RT-002-BGP-PEER-DOWN",
    category: "Routing",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("bgp-status")[0];
      if (!a) return [];
      const down = (a.dataJson.down as Array<{ peer: string; state: string }>) ?? [];
      if (down.length === 0) return [];
      return [
        {
          ruleId: "RT-002-BGP-PEER-DOWN",
          severity: "High",
          category: "Routing",
          title: "BGP peer(s) down",
          description: `${down.length} BGP peer(s) are not in the Established state.`,
          impact: "Down BGP peers can withdraw routes and cause loss of reachability to affected networks.",
          evidence: down.map((p) => evidenceFrom(a, `BGP peer ${p.peer}: ${p.state}`)),
          recommendation: "Check peer reachability, authentication, and BGP timers/AS configuration.",
          confidence: 78,
        },
      ];
    },
  },
  {
    id: "RT-003-OSPF-NEIGHBOR-DOWN",
    category: "Routing",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("ospf-status")[0];
      if (!a) return [];
      const down = (a.dataJson.down as Array<{ neighbor: string; state: string }>) ?? [];
      if (down.length === 0) return [];
      return [
        {
          ruleId: "RT-003-OSPF-NEIGHBOR-DOWN",
          severity: "High",
          category: "Routing",
          title: "OSPF neighbor(s) not full",
          description: `${down.length} OSPF neighbor(s) are not in the Full state.`,
          impact: "OSPF adjacencies that are not Full prevent route exchange and can black-hole traffic.",
          evidence: down.map((n) => evidenceFrom(a, `OSPF neighbor ${n.neighbor}: ${n.state}`)),
          recommendation: "Verify MTU, area configuration, timers, and authentication between OSPF neighbors.",
          confidence: 76,
        },
      ];
    },
  },
];
