import { Rule, Finding, evidenceFrom } from "./types";

export const panoramaRules: Rule[] = [
  {
    id: "PAN-001-DISCONNECTED",
    category: "Panorama",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("panorama-status")[0];
      if (!a || !a.dataJson.managed) return [];
      if (a.dataJson.connected) return [];
      return [
        {
          ruleId: "PAN-001-DISCONNECTED",
          severity: "Medium",
          category: "Panorama",
          title: "Firewall disconnected from Panorama",
          description: `The firewall appears to be Panorama-managed${a.dataJson.server ? ` (${a.dataJson.server})` : ""} but is not connected.`,
          impact: "While disconnected, the firewall cannot receive pushed configuration or report logs to Panorama.",
          evidence: [evidenceFrom(a, `Panorama connected: no${a.dataJson.server ? `, server ${a.dataJson.server}` : ""}`)],
          recommendation: "Verify connectivity to Panorama (TCP 3978), certificates, and that the device is added/committed on Panorama.",
          confidence: 70,
        },
      ];
    },
  },
  {
    id: "PAN-002-PUSH-FAILURE",
    category: "Panorama",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("panorama-status")[0];
      if (!a || !a.dataJson.managed || !a.dataJson.pushPending) return [];
      return [
        {
          ruleId: "PAN-002-PUSH-FAILURE",
          severity: "Medium",
          category: "Panorama",
          title: "Panorama push pending or failed",
          description: "Panorama commit-all / push activity appears pending or unsuccessful.",
          impact: "Pending or failed pushes mean the device may not have the intended Panorama configuration.",
          evidence: [evidenceFrom(a, "Panorama push: pending/failed")],
          recommendation: "Review the Panorama commit-all job status and retry the push after resolving validation errors.",
          confidence: 55,
        },
      ];
    },
  },
];
