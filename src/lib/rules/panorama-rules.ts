import { Rule, Finding, evidenceFrom } from "./types";

// Panorama-specific rules, driven by the panorama-management artifact plus the
// shared mp-resources artifact (CPU/mem/disk).
export const panoramaRuleSet: Rule[] = [
  {
    id: "PANW-PANO-001-DEVICE-DISCONNECTED",
    category: "Panorama",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("panorama-management")[0];
      const count = (a?.dataJson?.disconnectedCount as number) ?? 0;
      if (count === 0) return [];
      const samples = (a?.dataJson?.disconnectedDevices as string[]) ?? [];
      return [
        {
          ruleId: "PANW-PANO-001-DEVICE-DISCONNECTED",
          severity: "High",
          category: "Panorama",
          title: "Managed device(s) disconnected from Panorama",
          description: `${count} indication(s) of managed devices being disconnected/unreachable were found.`,
          impact: "Disconnected devices cannot receive pushes or forward logs to Panorama.",
          evidence: samples.slice(0, 3).map((s) => evidenceFrom(a, s)),
          recommendation: "Verify device connectivity (TCP 3978), certificates, and that devices are committed on Panorama.",
          confidence: 62,
        },
      ];
    },
  },
  {
    id: "PANW-PANO-002-COMMIT-ALL-FAILURE",
    category: "Panorama",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("panorama-management")[0];
      const count = (a?.dataJson?.commitAllFailureCount as number) ?? 0;
      if (count === 0) return [];
      const samples = (a?.dataJson?.commitAllFailures as string[]) ?? [];
      return [
        {
          ruleId: "PANW-PANO-002-COMMIT-ALL-FAILURE",
          severity: "High",
          category: "Panorama",
          title: "Commit-all / push failure detected",
          description: `${count} commit-all or push failure indication(s) were found.`,
          impact: "Failed pushes mean managed devices may not have the intended configuration.",
          evidence: samples.slice(0, 3).map((s) => evidenceFrom(a, s)),
          recommendation: "Review the commit-all job details, resolve validation errors, and retry the push.",
          confidence: 60,
        },
      ];
    },
  },
  {
    id: "PANW-PANO-003-HIGH-RESOURCE",
    category: "Panorama",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("mp-resources")[0];
      if (!a) return [];
      const cpu = a.dataJson.cpuPercent as number | null;
      const mem = a.dataJson.memoryPercent as number | null;
      const disk = a.dataJson.maxDiskPercent as number | null;
      const issues: string[] = [];
      if (cpu != null && cpu >= 85) issues.push(`CPU ${cpu}%`);
      if (mem != null && mem >= 90) issues.push(`Memory ${mem}%`);
      if (disk != null && disk >= 90) issues.push(`Disk ${disk}%`);
      if (issues.length === 0) return [];
      return [
        {
          ruleId: "PANW-PANO-003-HIGH-RESOURCE",
          severity: "Medium",
          category: "Panorama",
          title: "Panorama resource pressure",
          description: `Elevated resource usage on Panorama: ${issues.join(", ")}.`,
          impact: "Resource pressure on Panorama can slow commits, log ingestion, and reporting.",
          evidence: [evidenceFrom(a, issues.join(", "))],
          recommendation: "Review log collector load, reporting schedules, and platform sizing.",
          confidence: 66,
        },
      ];
    },
  },
];
