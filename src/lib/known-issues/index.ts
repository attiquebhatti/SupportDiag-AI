// Version-aware known-issue signature framework.
//
// Signatures describe SYMPTOM PATTERNS of publicly documented issue families.
// A match is never presented as an official vendor conclusion — match types are
// deliberately conservative and every match carries its evidence.

import { parsePanosVersion, compareVersions } from "../panos/version";

export type MatchType = "Exact Match" | "Strong Candidate" | "Possible Match" | "Insufficient Evidence";

export interface KnownIssueDef {
  issueId: string; // stable id, e.g. "PANOS-OOM-PANTASK"
  vendor: string;
  product: string; // product id or "any"
  title: string;
  /** Inclusive affected range; null = unbounded. */
  minAffectedVersion: string | null;
  maxAffectedVersion: string | null;
  fixedVersion: string | null;
  /** ALL core patterns must hit for Exact/Strong; ≥1 for Possible. */
  symptomPatterns: string[]; // regex sources, case-insensitive
  /** Artifact family ids that must be present for a confident match. */
  requiredEvidence: string[];
  /** If any exclusion pattern hits, the issue is ruled out. */
  exclusionPatterns: string[];
  sourceReference: string;
  remediation: string;
}

export interface EvidenceHit {
  filePath: string;
  line: number;
  snippet: string;
  pattern: string;
}

export interface KnownIssueMatchResult {
  issueId: string;
  matchType: MatchType;
  confidence: number; // 0-100
  explanation: string;
  evidence: EvidenceHit[];
  versionContext: string;
}

interface MatchInput {
  vendor: string | null;
  product: string | null;
  version: string | null; // raw PAN-OS version if known
  familiesPresent: string[]; // artifact family ids from the manifest
  files: Array<{ path: string; content: string | null }>;
}

function versionInRange(version: string | null, def: KnownIssueDef): "in" | "out" | "unknown" {
  const v = parsePanosVersion(version);
  if (!v) return "unknown";
  if (def.minAffectedVersion && compareVersions(v.raw, def.minAffectedVersion) < 0) return "out";
  if (def.maxAffectedVersion && compareVersions(v.raw, def.maxAffectedVersion) > 0) return "out";
  if (def.fixedVersion && compareVersions(v.raw, def.fixedVersion) >= 0) return "out";
  return "in";
}

function scanForPattern(
  pattern: string,
  files: MatchInput["files"],
  maxHits = 3
): EvidenceHit[] {
  const hits: EvidenceHit[] = [];
  let re: RegExp;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    return hits;
  }
  for (const f of files) {
    if (!f.content) continue;
    const lines = f.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        hits.push({
          filePath: f.path,
          line: i + 1,
          snippet: lines[i].slice(0, 300),
          pattern,
        });
        if (hits.length >= maxHits) return hits;
        break; // one hit per file per pattern is enough evidence
      }
    }
  }
  return hits;
}

/** Evaluate every enabled issue definition against the case evidence. */
export function matchKnownIssues(
  defs: KnownIssueDef[],
  input: MatchInput
): KnownIssueMatchResult[] {
  const results: KnownIssueMatchResult[] = [];

  for (const def of defs) {
    if (def.vendor !== "any" && input.vendor && def.vendor !== input.vendor) continue;
    if (def.product !== "any" && input.product && def.product !== input.product) continue;

    // Exclusions rule the issue out entirely.
    const excluded = def.exclusionPatterns.some(
      (p) => scanForPattern(p, input.files, 1).length > 0
    );
    if (excluded) continue;

    // Symptom evaluation.
    const perPattern = def.symptomPatterns.map((p) => scanForPattern(p, input.files));
    const matched = perPattern.filter((h) => h.length > 0);
    if (matched.length === 0) continue;

    const allSymptoms = matched.length === def.symptomPatterns.length;
    const evidence = matched.flat().slice(0, 6);
    const hasRequired =
      def.requiredEvidence.length === 0 ||
      def.requiredEvidence.every((fam) => input.familiesPresent.includes(fam));
    const vRange = versionInRange(input.version, def);
    if (vRange === "out") continue; // version rules it out

    let matchType: MatchType;
    let confidence: number;
    if (allSymptoms && hasRequired && vRange === "in") {
      matchType = "Exact Match";
      confidence = 85;
    } else if (allSymptoms && (vRange === "unknown" || !hasRequired)) {
      matchType = "Strong Candidate";
      confidence = 65;
    } else {
      matchType = "Possible Match";
      confidence = 40;
    }

    const versionContext =
      vRange === "in"
        ? `Detected version ${input.version} is within the affected range${def.fixedVersion ? ` (fixed in ${def.fixedVersion})` : ""}.`
        : `Version could not be confirmed — affected range ${def.minAffectedVersion ?? "…"} to ${def.maxAffectedVersion ?? "…"}${def.fixedVersion ? `, fixed in ${def.fixedVersion}` : ""}.`;

    results.push({
      issueId: def.issueId,
      matchType,
      confidence,
      explanation:
        `${matched.length}/${def.symptomPatterns.length} symptom pattern(s) matched` +
        (hasRequired ? "" : "; some required evidence families are missing") +
        `. ${versionContext}`,
      evidence,
      versionContext,
    });
  }

  const order: Record<MatchType, number> = {
    "Exact Match": 0,
    "Strong Candidate": 1,
    "Possible Match": 2,
    "Insufficient Evidence": 3,
  };
  results.sort((a, b) => order[a.matchType] - order[b.matchType] || b.confidence - a.confidence);
  return results;
}

// ---------------------------------------------------------------------------
// Seed catalog — placeholder signatures for publicly documented issue FAMILIES.
// Version ranges are intentionally left open (null) where we cannot verify
// exact affected releases; matches therefore surface as Strong Candidate /
// Possible Match rather than asserting a specific defect. Verify against the
// official vendor documentation referenced before acting.
// ---------------------------------------------------------------------------
const VERIFY = "Verify against official Palo Alto Networks release notes / knowledge base before acting.";

export const KNOWN_ISSUE_CATALOG: KnownIssueDef[] = [
  {
    issueId: "PANOS-OOM-PANTASK",
    vendor: "palo_alto",
    product: "panos_ngfw",
    title: "Out-of-memory pressure with pan_task involvement",
    minAffectedVersion: null,
    maxAffectedVersion: null,
    fixedVersion: null,
    symptomPatterns: [
      String.raw`out of memory|oom[- ]?kill`,
      String.raw`pan_task`,
    ],
    requiredEvidence: ["SYSTEM_LOG"],
    exclusionPatterns: [],
    sourceReference: VERIFY,
    remediation:
      "Correlate the OOM events with process memory in `show system resources`, check for known memory-leak advisories on the running release, and collect a fresh TSF after the next occurrence. Escalate to TAC with the core/crash references if it recurs.",
  },
  {
    issueId: "PANOS-HA1-PORT-MAPPING",
    vendor: "palo_alto",
    product: "panos_ngfw",
    title: "HA1 control-link instability (port/keepalive family)",
    minAffectedVersion: null,
    maxAffectedVersion: null,
    fixedVersion: null,
    symptomPatterns: [
      String.raw`ha1.*(down|lost|timeout)|heartbeat.*(lost|missed)`,
      String.raw`peer.*(down|lost|unreachable)`,
    ],
    requiredEvidence: ["HA_AGENT_LOG"],
    exclusionPatterns: [String.raw`ha1.*administratively down`],
    sourceReference: VERIFY,
    remediation:
      "Check HA1 physical path and dedicated/in-band port mapping, review keepalive settings, and compare both peers' ha_agent.log timelines (upload the peer TSF for comparison).",
  },
  {
    issueId: "PANOS-HA2-HSCI-INSTABILITY",
    vendor: "palo_alto",
    product: "panos_ngfw",
    title: "HA2 / HSCI session-sync instability",
    minAffectedVersion: null,
    maxAffectedVersion: null,
    fixedVersion: null,
    symptomPatterns: [String.raw`ha2.*(down|error|fail)|hsci.*(down|error|fail)`],
    requiredEvidence: [],
    exclusionPatterns: [],
    sourceReference: VERIFY,
    remediation:
      "Validate HA2/HSCI transport (cabling, transceivers, MTU), review brdagent.log for port events, and confirm session synchronization state on both peers.",
  },
  {
    issueId: "PANOS-COMMIT-ID-POPULATION",
    vendor: "palo_alto",
    product: "any",
    title: "Commit failure — ID manager population/exhaustion family",
    minAffectedVersion: null,
    maxAffectedVersion: null,
    fixedVersion: null,
    symptomPatterns: [
      String.raw`(error populating id|id population failed|no id available|idmgr)`,
    ],
    requiredEvidence: [],
    exclusionPatterns: [],
    sourceReference: VERIFY,
    remediation:
      "Identify the object family exhausting IDs in ms.log/devsrvr.log, review object counts against platform limits, and consult vendor guidance on ID-manager database recovery before attempting fixes.",
  },
  {
    issueId: "PANOS-USERID-HIP-LOG-LOSS",
    vendor: "palo_alto",
    product: "panos_ngfw",
    title: "User-ID / HIP log loss or forwarding gap",
    minAffectedVersion: null,
    maxAffectedVersion: null,
    fixedVersion: null,
    symptomPatterns: [
      String.raw`(useridd|user-id).*(error|fail|drop)|hip.*(missing|fail|not received)`,
    ],
    requiredEvidence: [],
    exclusionPatterns: [],
    sourceReference: VERIFY,
    remediation:
      "Confirm User-ID agent connectivity and log forwarding configuration; verify HIP match logs are being generated and forwarded on the running release.",
  },
  {
    issueId: "PANOS-DECRYPT-LOG-DISPLAY",
    vendor: "palo_alto",
    product: "panos_ngfw",
    title: "Decryption log forwarding/display inconsistency family",
    minAffectedVersion: "11.1",
    maxAffectedVersion: null,
    fixedVersion: null,
    symptomPatterns: [String.raw`decrypt(ion)?.*(log).*(fail|error|missing|not (shown|forwarded))`],
    requiredEvidence: [],
    exclusionPatterns: [],
    sourceReference: VERIFY,
    remediation:
      "Confirm decryption log settings on the policy, verify forwarding profiles, and compare against release-specific decryption logging notes for the running version.",
  },
  {
    issueId: "PANOS-GP-CUSTOM-LOG-FORMAT",
    vendor: "palo_alto",
    product: "panos_ngfw",
    title: "GlobalProtect custom log-format anomaly family",
    minAffectedVersion: null,
    maxAffectedVersion: null,
    fixedVersion: null,
    symptomPatterns: [String.raw`globalprotect.*(log format|custom format).*(error|invalid|fail)`],
    requiredEvidence: [],
    exclusionPatterns: [],
    sourceReference: VERIFY,
    remediation:
      "Review custom log format definitions in the log forwarding profile against the GlobalProtect field reference for the running version.",
  },
  {
    issueId: "PANOS-POST-UPGRADE-LOG-ACCESS",
    vendor: "palo_alto",
    product: "any",
    title: "Post-upgrade log access/visibility issue family",
    minAffectedVersion: null,
    maxAffectedVersion: null,
    fixedVersion: null,
    symptomPatterns: [
      String.raw`(after|post).{0,20}upgrade.{0,60}log|log.{0,40}(unavailable|not (visible|accessible)).{0,40}upgrade`,
    ],
    requiredEvidence: [],
    exclusionPatterns: [],
    sourceReference: VERIFY,
    remediation:
      "Verify logdb version/migration status after the upgrade, confirm disk space on the log partition, and review release notes for logging migration steps for the target version.",
  },
  {
    issueId: "PANOS-PACKET-DIAG-LEFT-ON",
    vendor: "palo_alto",
    product: "panos_ngfw",
    title: "Packet-diag left enabled (operational, not a defect)",
    minAffectedVersion: null,
    maxAffectedVersion: null,
    fixedVersion: null,
    symptomPatterns: [String.raw`packet[- ]diag.*(on|enable)|pan_packet_diag\.log`],
    requiredEvidence: [],
    exclusionPatterns: [String.raw`packet[- ]diag.*(off|disable)d?\b`],
    sourceReference: "Operational best practice — packet-diag should be disabled after troubleshooting.",
    remediation:
      "Disable packet-diag (`debug dataplane packet-diag set capture off` / clear filters) and remove any any-any filters; monitor pan_packet_diag.log growth and dataplane load afterwards.",
  },
];
