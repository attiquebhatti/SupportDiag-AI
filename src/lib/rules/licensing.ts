import { Rule, Finding, evidenceFrom } from "./types";

// Content is considered outdated if the version date is older than this many days.
const CONTENT_STALE_DAYS = 14;

function daysFromContentVersion(version: string | null): number | null {
  if (!version) return null;
  // PAN-OS content versions embed a date-ish first component, but not a true
  // date; we cannot reliably compute age from version alone, so we only flag
  // when an explicit release date is unavailable. Returns null (unknown).
  return null;
}

export const licensingRules: Rule[] = [
  {
    id: "LIC-001-EXPIRED",
    category: "Licensing & Content",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("licenses")[0];
      if (!a) return [];
      const expired = (a.dataJson.expired as Array<{ feature: string; expires: string }>) ?? [];
      if (expired.length === 0) return [];
      return [
        {
          ruleId: "LIC-001-EXPIRED",
          severity: "High",
          category: "Licensing & Content",
          title: "Expired license(s) detected",
          description: `${expired.length} license(s) appear to be expired.`,
          impact: "Expired subscriptions (Threat, URL, WildFire, support) disable protections and updates.",
          evidence: expired.map((l) => evidenceFrom(a, `${l.feature}: expired ${l.expires}`)),
          recommendation: "Renew the affected subscriptions and re-fetch licenses on the device.",
          confidence: 80,
        },
      ];
    },
  },
  {
    id: "LIC-002-THREAT-OUTDATED",
    category: "Licensing & Content",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("content-versions")[0];
      if (!a) return [];
      const threat = (a.dataJson.threat as { version: string | null }) ?? { version: null };
      if (!threat.version) {
        return [
          {
            ruleId: "LIC-002-THREAT-OUTDATED",
            severity: "Informational",
            category: "Licensing & Content",
            title: "Threat content version not detected",
            description: "No threat content version could be determined from the support file.",
            impact: "Unable to confirm the device is running current threat protection content.",
            evidence: [evidenceFrom(a, "threat-version: (not found)")],
            recommendation: "Verify Dynamic Updates are scheduled and the latest Threat content is installed.",
            confidence: 40,
          },
        ];
      }
      return [];
    },
  },
  {
    id: "LIC-003-APP-OUTDATED",
    category: "Licensing & Content",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("content-versions")[0];
      if (!a) return [];
      const app = (a.dataJson.app as { version: string | null }) ?? { version: null };
      const age = daysFromContentVersion(app.version);
      if (age != null && age > CONTENT_STALE_DAYS) {
        return [
          {
            ruleId: "LIC-003-APP-OUTDATED",
            severity: "Medium",
            category: "Licensing & Content",
            title: "Application content outdated",
            description: `App content (${app.version}) is older than ${CONTENT_STALE_DAYS} days.`,
            impact: "Outdated App-ID content reduces accuracy of application identification and policy.",
            evidence: [evidenceFrom(a, `app-version: ${app.version}`)],
            recommendation: "Schedule and install the latest Applications and Threats content.",
            confidence: 55,
          },
        ];
      }
      return [];
    },
  },
  {
    id: "LIC-004-WILDFIRE-OUTDATED",
    category: "Licensing & Content",
    evaluate(ctx): Finding[] {
      const a = ctx.byType("content-versions")[0];
      if (!a) return [];
      const wf = (a.dataJson.wildfire as { version: string | null }) ?? { version: null };
      if (!wf.version) {
        return [
          {
            ruleId: "LIC-004-WILDFIRE-OUTDATED",
            severity: "Informational",
            category: "Licensing & Content",
            title: "WildFire content version not detected",
            description: "No WildFire content version could be determined from the support file.",
            impact: "Unable to confirm the device receives near-real-time WildFire updates.",
            evidence: [evidenceFrom(a, "wildfire-version: (not found)")],
            recommendation: "Confirm a WildFire license is active and updates are set to every-minute where supported.",
            confidence: 40,
          },
        ];
      }
      return [];
    },
  },
];
