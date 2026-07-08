import { Rule, Finding, evidenceFrom } from "./types";

const CPU_THRESHOLD = 85;
const MEM_THRESHOLD = 90;
const DISK_THRESHOLD = 90;

export const systemHealthRules: Rule[] = [
  {
    id: "SYS-001-MP-CPU",
    category: "System Health",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("mp-resources")[0];
      const cpu = a?.dataJson?.cpuPercent as number | null;
      if (cpu == null || cpu < CPU_THRESHOLD) return [];
      return [
        {
          ruleId: "SYS-001-MP-CPU",
          severity: cpu >= 95 ? "High" : "Medium",
          category: "System Health",
          title: "High management plane CPU utilization",
          description: `Management plane CPU is at ${cpu}%, above the ${CPU_THRESHOLD}% threshold.`,
          impact: "Sustained high MP CPU can slow the web UI, API, logging, and commit operations.",
          evidence: [evidenceFrom(a, `Management CPU: ${cpu}%`)],
          recommendation: "Identify the top MP processes (management-server, logrcvr, useridd). Review logging rate, scheduled reports, and API polling frequency.",
          confidence: 80,
        },
      ];
    },
  },
  {
    id: "SYS-002-DP-CPU",
    category: "System Health",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("dp-resources")[0];
      const cpu = (a?.dataJson?.maxCorePercent ?? a?.dataJson?.avgCorePercent) as number | null;
      if (cpu == null || cpu < CPU_THRESHOLD) return [];
      return [
        {
          ruleId: "SYS-002-DP-CPU",
          severity: cpu >= 95 ? "High" : "Medium",
          category: "System Health",
          title: "High data plane CPU utilization",
          description: `Data plane CPU load reached ${cpu}%, above the ${CPU_THRESHOLD}% threshold.`,
          impact: "High dataplane CPU can cause packet buffer congestion, latency, and session drops.",
          evidence: [evidenceFrom(a, `Data plane CPU: ${cpu}%`)],
          recommendation: "Review throughput vs. platform capacity, decryption load, and top applications. Check for packet buffer protection events.",
          confidence: 78,
        },
      ];
    },
  },
  {
    id: "SYS-003-MEMORY",
    category: "System Health",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("mp-resources")[0];
      const mem = a?.dataJson?.memoryPercent as number | null;
      if (mem == null || mem < MEM_THRESHOLD) return [];
      return [
        {
          ruleId: "SYS-003-MEMORY",
          severity: mem >= 97 ? "High" : "Medium",
          category: "System Health",
          title: "High memory usage",
          description: `Memory utilization is at ${mem}%, above the ${MEM_THRESHOLD}% threshold.`,
          impact: "Memory pressure can trigger process restarts and degraded management responsiveness.",
          evidence: [evidenceFrom(a, `Memory usage: ${mem}%`)],
          recommendation: "Check for memory-heavy processes and known PAN-OS memory advisories for the running version.",
          confidence: 75,
        },
      ];
    },
  },
  {
    id: "SYS-004-DISK",
    category: "System Health",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("mp-resources")[0];
      const disks = (a?.dataJson?.disks as Array<{ mount: string; usedPercent: number }>) ?? [];
      const full = disks.filter((d) => d.usedPercent >= DISK_THRESHOLD);
      if (full.length === 0) return [];
      return [
        {
          ruleId: "SYS-004-DISK",
          severity: full.some((d) => d.usedPercent >= 95) ? "High" : "Medium",
          category: "System Health",
          title: "Low disk space",
          description: `One or more partitions are above ${DISK_THRESHOLD}% usage: ${full.map((d) => `${d.mount} (${d.usedPercent}%)`).join(", ")}.`,
          impact: "A full partition can prevent logging, commits, and content updates.",
          evidence: full.map((d) => evidenceFrom(a, `${d.mount}: ${d.usedPercent}% used`)),
          recommendation: "Clear old logs/cores, verify log quota settings, and expand the affected partition if applicable.",
          confidence: 85,
        },
      ];
    },
  },
  {
    id: "SYS-005-CORE-FILES",
    category: "System Health",
    evaluate(ctx): Finding[] {
      const arts = ctx.byType("core-files");
      const total = arts.reduce((sum, a) => sum + ((a.dataJson?.count as number) ?? 0), 0);
      if (total === 0) return [];
      return [
        {
          ruleId: "SYS-005-CORE-FILES",
          severity: "High",
          category: "System Health",
          title: "Core files detected",
          description: `${total} core/crash file reference(s) were found in the support bundle.`,
          impact: "Core files indicate a process crashed and may point to a software defect or resource issue.",
          evidence: arts.map((a) => evidenceFrom(a, `${(a.dataJson?.count as number) ?? 0} core file(s) in ${a.sourceFilePath}`)),
          recommendation: "Correlate the crashing process and timestamps. Search for matching PAN-OS advisories; open a TAC case if it recurs.",
          confidence: 88,
        },
      ];
    },
  },
  {
    id: "SYS-006-PROCESS-RESTART",
    category: "System Health",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("system-events")[0];
      const count = (a?.dataJson?.processRestartCount as number) ?? 0;
      if (count === 0) return [];
      const restarts = (a?.dataJson?.recentRestarts as string[]) ?? [];
      return [
        {
          ruleId: "SYS-006-PROCESS-RESTART",
          severity: count >= 5 ? "High" : "Medium",
          category: "System Health",
          title: "Recent process restart(s) detected",
          description: `${count} process restart/crash event(s) were found in system logs.`,
          impact: "Repeated daemon restarts can cause intermittent management or dataplane disruption.",
          evidence: restarts.slice(-3).map((r) => evidenceFrom(a, r)),
          recommendation: "Identify the restarting process and frequency. Review known issues for the running PAN-OS version.",
          confidence: 70,
        },
      ];
    },
  },
  {
    id: "SYS-007-UNEXPECTED-REBOOT",
    category: "System Health",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("system-events")[0];
      const count = (a?.dataJson?.unexpectedRebootCount as number) ?? 0;
      if (count === 0) return [];
      const reboots = (a?.dataJson?.recentReboots as string[]) ?? [];
      return [
        {
          ruleId: "SYS-007-UNEXPECTED-REBOOT",
          severity: "High",
          category: "System Health",
          title: "Unexpected reboot indicators",
          description: `${count} indicator(s) of unexpected reboot / shutdown / kernel panic were found.`,
          impact: "Unexpected reboots cause traffic outage and may indicate hardware or software faults.",
          evidence: reboots.slice(-3).map((r) => evidenceFrom(a, r)),
          recommendation: "Review reboot reason logs and hardware status. Engage TAC if hardware fault is suspected.",
          confidence: 72,
        },
      ];
    },
  },
];
