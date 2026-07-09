import { Rule, Finding, Severity, evidenceFrom } from "./types";

// Generic Cortex XDR / XSIAM rules. Each maps a keyword-artifact from the Cortex
// parsers to a finding. Confidence is moderate because bundle formats vary.

interface CortexRuleDef {
  ruleId: string;
  artifactType: string;
  severity: Severity;
  category: string;
  title: string;
  impact: string;
  recommendation: string;
}

const DEFS: CortexRuleDef[] = [
  { ruleId: "CTX-XDR-001-AGENT-CONN", artifactType: "cortex-agent", severity: "High", category: "Cortex Agent", title: "Cortex agent connectivity errors", impact: "Agents that cannot connect stop reporting telemetry and receiving policy.", recommendation: "Verify agent-to-cloud connectivity, proxy settings, and certificate trust." },
  { ruleId: "CTX-XDR-002-BROKER", artifactType: "cortex-broker", severity: "High", category: "Cortex Broker VM", title: "Broker VM issues detected", impact: "Broker VM problems disrupt log ingestion and applet delivery.", recommendation: "Check Broker VM status, disk, and connectivity to the tenant." },
  { ruleId: "CTX-XDR-003-COLLECTOR", artifactType: "cortex-collector", severity: "Medium", category: "Cortex Agent", title: "Collector / ingestion errors", impact: "Collector errors cause data loss or delayed detection.", recommendation: "Review collector health, backlog, and network path to the tenant." },
  { ruleId: "CTX-XDR-004-CONTENT", artifactType: "cortex-content", severity: "Medium", category: "Licensing & Content", title: "Content update failures", impact: "Outdated content reduces detection efficacy.", recommendation: "Confirm content update connectivity and licensing." },
  { ruleId: "CTX-XDR-005-POLICY", artifactType: "cortex-policy", severity: "Medium", category: "Cortex Agent", title: "Policy / profile errors", impact: "Policy errors can leave endpoints unprotected or misconfigured.", recommendation: "Review the affected policy/profile and re-apply." },
  { ruleId: "CTX-XDR-006-SERVICE", artifactType: "cortex-service", severity: "Medium", category: "Logs", title: "Service restart / crash indicators", impact: "Repeated service restarts indicate instability on the endpoint.", recommendation: "Correlate the restarting service and check for known issues." },
  { ruleId: "CTX-XDR-007-AUTH", artifactType: "cortex-auth", severity: "Medium", category: "Logs", title: "Authentication / integration failures", impact: "Auth failures break integrations and data flow.", recommendation: "Rotate/verify tokens and certificates for the affected integration." },
  // XSIAM
  { ruleId: "CTX-XSIAM-001-INGEST", artifactType: "xsiam-ingestion", severity: "High", category: "XSIAM Ingestion", title: "Data ingestion issues", impact: "Ingestion problems cause data gaps and missed detections.", recommendation: "Inspect the affected data sources, collectors, and quotas." },
  { ruleId: "CTX-XSIAM-002-PARSING", artifactType: "xsiam-parsing", severity: "Medium", category: "XSIAM Ingestion", title: "Parsing rule errors", impact: "Parsing errors produce malformed or dropped events.", recommendation: "Review the failing parsing rules and source formats." },
  { ruleId: "CTX-XSIAM-003-CORRELATION", artifactType: "xsiam-correlation", severity: "Medium", category: "XSIAM Ingestion", title: "Correlation rule errors", impact: "Correlation errors reduce detection coverage.", recommendation: "Validate the correlation rule logic and referenced datasets." },
  { ruleId: "CTX-XSIAM-004-DATASET", artifactType: "xsiam-dataset", severity: "Medium", category: "XSIAM Ingestion", title: "Dataset errors", impact: "Dataset errors break queries and dashboards.", recommendation: "Confirm dataset schema and ingestion mapping." },
  { ruleId: "CTX-XSIAM-005-XQL", artifactType: "xsiam-xql", severity: "Low", category: "XSIAM Ingestion", title: "XQL query errors", impact: "XQL errors indicate failing scheduled queries or rules.", recommendation: "Fix XQL syntax / referenced fields in the failing queries." },
  { ruleId: "CTX-XSIAM-006-COLLECTOR", artifactType: "xsiam-collector", severity: "High", category: "Cortex Broker VM", title: "Collector / broker health issues", impact: "Unhealthy collectors/brokers stop data flow to the tenant.", recommendation: "Check broker/collector status, disk, and connectivity." },
];

export const cortexRuleSet: Rule[] = DEFS.map((d) => ({
  id: d.ruleId,
  category: d.category,
  evaluate(ctx): Finding[] {
    const a = ctx.byType(d.artifactType)[0];
    const count = (a?.dataJson?.count as number) ?? 0;
    if (!a || count === 0) return [];
    const samples = (a.dataJson.samples as string[]) ?? [];
    return [
      {
        ruleId: d.ruleId,
        severity: d.severity,
        category: d.category,
        title: d.title,
        description: `${count} occurrence(s) detected in ${a.sourceFilePath}.`,
        impact: d.impact,
        evidence: samples.slice(0, 3).map((s) => evidenceFrom(a, s)),
        recommendation: d.recommendation,
        confidence: 55,
      },
    ];
  },
}));
