// PAN-OS TSF artifact normalization registry.
//
// Tech Support Files vary by platform (PA hardware family, VM-Series, chassis),
// slot, data-plane instance, and PAN-OS version. This registry maps physical
// paths to stable LOGICAL artifact families so analyzers and rules never depend
// on one exact path (e.g. dp0-log/ vs s1dp0-log/ vs cp-log/).

export type Plane = "mp" | "dp" | "cp" | "system";

export interface ArtifactFamily {
  id: string; // logical alias, e.g. SYSTEM_LOG
  label: string;
  plane: Plane;
  /** Regexes tested against the normalized (lowercased, /-separated) path. */
  patterns: RegExp[];
  /** Which products this family is expected in (for missing-evidence checks). */
  expectedFor: Array<"panos_ngfw" | "panorama">;
  /** Missing-evidence message when expected but absent. */
  missingMessage?: string;
  /** Diagnostic areas this family feeds. */
  areas: string[];
}

// Log rotation suffixes (.1, .2.gz …) are tolerated by ending patterns loosely.
const LOG = String.raw`(\.\d+)?(\.gz)?$`;

export const ARTIFACT_FAMILIES: ArtifactFamily[] = [
  {
    id: "CLI_TECHSUPPORT",
    label: "CLI snapshot (techsupport)",
    plane: "mp",
    patterns: [/tmp\/cli\/techsupport/, /(^|\/)techsupport(\.txt)?$/, /cli[_-]?(output|snapshot)/],
    expectedFor: ["panos_ngfw", "panorama"],
    missingMessage: "No CLI snapshot (techsupport command output) was detected.",
    areas: ["device", "resources", "ha", "interfaces", "routing", "vpn"],
  },
  {
    id: "SDB",
    label: "Interface state database (sdb.txt)",
    plane: "mp",
    patterns: [/tmp\/cli\/logs\/sdb\.txt/, /(^|\/)sdb\.txt$/],
    expectedFor: ["panos_ngfw"],
    missingMessage: "No interface state database output (sdb.txt) was found.",
    areas: ["interfaces"],
  },
  {
    id: "SYSTEM_LOG",
    label: "System log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/system\.log${LOG}`), new RegExp(String.raw`(^|\/)system\.log${LOG}`)],
    expectedFor: ["panos_ngfw", "panorama"],
    missingMessage: "No management-plane system.log was found.",
    areas: ["resources", "ha", "timeline"],
  },
  {
    id: "MASTERD_LOG",
    label: "masterd log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/masterd\.log${LOG}`)],
    expectedFor: ["panos_ngfw", "panorama"],
    areas: ["resources"],
  },
  {
    id: "AUTH_LOG",
    label: "authd log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/authd\.log${LOG}`)],
    expectedFor: [],
    areas: ["globalprotect", "userid"],
  },
  {
    id: "HA_AGENT_LOG",
    label: "HA agent log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/ha[_-]agent\.log${LOG}`)],
    expectedFor: [],
    areas: ["ha", "timeline"],
  },
  {
    id: "RASMGR_LOG",
    label: "rasmgr log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/rasmgr\.log${LOG}`)],
    expectedFor: [],
    areas: ["globalprotect"],
  },
  {
    id: "BRD_AGENT_LOG",
    label: "Board agent log",
    plane: "cp",
    patterns: [new RegExp(String.raw`(mp-log|cp-log)\/brdagent\.log${LOG}`)],
    expectedFor: [],
    areas: ["ha", "interfaces"],
  },
  {
    id: "COMMIT_MANAGER_LOG",
    label: "Management server (ms) log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/ms\.log${LOG}`)],
    expectedFor: ["panos_ngfw", "panorama"],
    missingMessage: "No commit-related logs (ms.log) were found.",
    areas: ["commit"],
  },
  {
    id: "DEVICE_SERVER_LOG",
    label: "Device server log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/devsrvr\.log${LOG}`)],
    expectedFor: ["panos_ngfw"],
    areas: ["commit"],
  },
  {
    id: "USER_ID_LOG",
    label: "User-ID daemon log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/useridd\.log${LOG}`)],
    expectedFor: [],
    areas: ["userid", "globalprotect"],
  },
  {
    id: "IKE_MANAGER_LOG",
    label: "IKE manager log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/ikemgr\.log${LOG}`)],
    expectedFor: [],
    areas: ["vpn"],
  },
  {
    id: "GLOBALPROTECT_SERVICE_LOG",
    label: "GlobalProtect service log",
    plane: "mp",
    // Version-dependent: appweb3-sslvpn.log (≤10.1) vs gpsvc.log (≥10.2).
    patterns: [
      new RegExp(String.raw`mp-log\/appweb3-sslvpn\.log${LOG}`),
      new RegExp(String.raw`mp-log\/gpsvc\.log${LOG}`),
    ],
    expectedFor: [],
    missingMessage: "No GlobalProtect service log was found.",
    areas: ["globalprotect"],
  },
  {
    id: "REPORTD_LOG",
    label: "reportd log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/reportd\.log${LOG}`)],
    expectedFor: [],
    areas: ["logging"],
  },
  {
    id: "DISTRIBUTORD_LOG",
    label: "distributord log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/distributord\.log${LOG}`)],
    expectedFor: [],
    areas: ["logging"],
  },
  {
    id: "LOG_RECEIVER_LOG",
    label: "Log receiver log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/logrcvr\.log${LOG}`)],
    expectedFor: [],
    areas: ["logging"],
  },
  {
    id: "CONFIGD_LOG",
    label: "configd log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/configd\.log${LOG}`)],
    expectedFor: ["panorama"],
    areas: ["commit"],
  },
  {
    id: "SSL_MANAGER_LOG",
    label: "sslmgr log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/sslmgr\.log${LOG}`)],
    expectedFor: [],
    areas: ["decryption", "globalprotect"],
  },
  {
    id: "WEB_BACKEND_LOG",
    label: "Web backend log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/web_backend\.log${LOG}`)],
    expectedFor: [],
    areas: ["management"],
  },
  {
    id: "MP_MONITOR_LOG",
    label: "MP monitor log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/mp-monitor\.log${LOG}`)],
    expectedFor: [],
    areas: ["resources"],
  },
  {
    id: "PAN_COMM_LOG",
    label: "Panorama comm log",
    plane: "mp",
    patterns: [new RegExp(String.raw`mp-log\/pan_comm\.log${LOG}`)],
    expectedFor: [],
    areas: ["panorama"],
  },
  {
    id: "DP_MONITOR_LOG",
    label: "Data-plane monitor log",
    plane: "dp",
    // dp0-log/, dp1-log/, s1dp0-log/ (chassis slot), etc.
    patterns: [new RegExp(String.raw`(s\d+)?dp\d+-log\/dp-monitor\.log${LOG}`)],
    expectedFor: ["panos_ngfw"],
    missingMessage: "No data-plane monitor log (dp-monitor.log) was found.",
    areas: ["resources"],
  },
  {
    id: "CORES",
    label: "Crash / core artifacts",
    plane: "system",
    patterns: [
      /var\/cores\//,
      /var\.dp\d+\/cores\//,
      /(^|\/)cores?\//,
      /crashinfo/,
      /kernel[_-]panic/,
      /core\.\d+/,
      /\.core(\.|$)/,
    ],
    expectedFor: [],
    areas: ["crashes", "resources"],
  },
  {
    id: "RUNNING_CONFIG",
    label: "Running configuration",
    plane: "mp",
    patterns: [/running-config\.xml/, /merged-config\.xml/],
    expectedFor: ["panos_ngfw", "panorama"],
    missingMessage: "No running configuration (running-config.xml) was found.",
    areas: ["commit", "config"],
  },
];

export interface ClassifiedFile {
  path: string;
  family: string | null; // ArtifactFamily.id
  plane: Plane | null;
}

export interface TsfManifest {
  totalFiles: number;
  classified: number;
  familiesPresent: string[]; // family ids
  familyCounts: Record<string, number>;
  files: ClassifiedFile[]; // capped
  missingEvidence: string[]; // human messages for expected-but-absent families
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

/** Classify a single path into an artifact family (first match wins). */
export function classifyPath(path: string): ArtifactFamily | null {
  const np = normalizePath(path);
  for (const family of ARTIFACT_FAMILIES) {
    if (family.patterns.some((re) => re.test(np))) return family;
  }
  return null;
}

/**
 * Build the normalized TSF manifest: per-family presence/counts plus
 * missing-evidence messages for families expected for this product.
 */
export function buildManifest(
  paths: string[],
  product: string | null
): TsfManifest {
  const files: ClassifiedFile[] = [];
  const familyCounts: Record<string, number> = {};

  for (const path of paths) {
    const fam = classifyPath(path);
    files.push({ path, family: fam?.id ?? null, plane: fam?.plane ?? null });
    if (fam) familyCounts[fam.id] = (familyCounts[fam.id] ?? 0) + 1;
  }

  const present = new Set(Object.keys(familyCounts));
  const missingEvidence: string[] = [];
  if (product === "panos_ngfw" || product === "panorama") {
    for (const fam of ARTIFACT_FAMILIES) {
      if (
        fam.expectedFor.includes(product) &&
        !present.has(fam.id) &&
        fam.missingMessage
      ) {
        missingEvidence.push(fam.missingMessage);
      }
    }
  }

  return {
    totalFiles: paths.length,
    classified: files.filter((f) => f.family).length,
    familiesPresent: [...present].sort(),
    familyCounts,
    files: files.slice(0, 2000), // cap stored detail
    missingEvidence,
  };
}

export const FAMILY_MAP: Record<string, ArtifactFamily> = Object.fromEntries(
  ARTIFACT_FAMILIES.map((f) => [f.id, f])
);
