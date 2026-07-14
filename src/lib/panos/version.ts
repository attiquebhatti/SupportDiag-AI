// PAN-OS version-awareness layer.
//
// Log locations, process availability, and timestamp precision vary by PAN-OS
// version. This module turns a detected version string into an "evidence
// model" that parsers, analyzers, and the UI can consult — so version-specific
// conclusions always carry the detected version with them.

export interface PanosVersion {
  raw: string;
  major: number;
  minor: number;
  patch: number;
}

/** Parse "10.2.4-h3" / "11.1.0" style version strings. Null when unparseable. */
export function parsePanosVersion(raw: string | null | undefined): PanosVersion | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return {
    raw: raw.trim(),
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: m[3] ? parseInt(m[3], 10) : 0,
  };
}

/** Compare a parsed version against "major.minor" (patch optional). */
export function atLeast(v: PanosVersion, spec: string): boolean {
  const s = parsePanosVersion(spec);
  if (!s) return false;
  if (v.major !== s.major) return v.major > s.major;
  if (v.minor !== s.minor) return v.minor > s.minor;
  return v.patch >= s.patch;
}

export function compareVersions(a: string, b: string): number {
  const pa = parsePanosVersion(a);
  const pb = parsePanosVersion(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

export interface EvidenceModel {
  detectedVersion: string | null;
  versionKnown: boolean;
  /** Which GlobalProtect service log applies to this version. */
  gpServiceLog: "appweb3-sslvpn.log" | "gpsvc.log" | "either (version unknown)";
  /** Processes expected to exist at this version. */
  expectedProcesses: string[];
  /** Timestamp precision notes shown in the timeline/UI. */
  timestampNotes: string[];
  /** Decryption evidence expectations. */
  decryptionNotes: string[];
  /** General parser decisions taken because of the version. */
  parserDecisions: string[];
}

/**
 * Build the version-aware evidence model. All statements here are
 * version-conditional expectations, not conclusions about the device.
 */
export function buildEvidenceModel(versionRaw: string | null): EvidenceModel {
  const v = parsePanosVersion(versionRaw);

  if (!v) {
    return {
      detectedVersion: versionRaw ?? null,
      versionKnown: false,
      gpServiceLog: "either (version unknown)",
      expectedProcesses: [],
      timestampNotes: [
        "PAN-OS version could not be determined — timestamp precision assumptions are conservative.",
      ],
      decryptionNotes: [
        "Version unknown — dedicated decryption log expectations were not applied.",
      ],
      parserDecisions: [
        "Version detection failed; both appweb3-sslvpn.log and gpsvc.log are treated as GlobalProtect service logs.",
      ],
    };
  }

  const decisions: string[] = [];
  const tsNotes: string[] = [];
  const decNotes: string[] = [];

  // GlobalProtect service log: appweb3-sslvpn.log through 10.1; gpsvc.log from 10.2.
  const gpLog = atLeast(v, "10.2") ? "gpsvc.log" : "appweb3-sslvpn.log";
  decisions.push(
    gpLog === "gpsvc.log"
      ? `PAN-OS ${v.raw} ≥ 10.2 — GlobalProtect service events are read from gpsvc.log.`
      : `PAN-OS ${v.raw} ≤ 10.1 — GlobalProtect service events are read from appweb3-sslvpn.log.`
  );

  // Process-version awareness.
  const processes = ["masterd", "ms", "devsrvr", "authd", "useridd", "ikemgr", "logrcvr"];
  if (atLeast(v, "10.0")) processes.push("distributord");
  else decisions.push("distributord not expected before PAN-OS 10.0 — its absence is not flagged.");
  if (atLeast(v, "10.1")) processes.push("reportd");
  else decisions.push("reportd not expected before PAN-OS 10.1 — its absence is not flagged.");

  // Timestamp precision awareness.
  if (atLeast(v, "10.0")) {
    tsNotes.push("Traffic/decryption log families may carry high-resolution timestamps (≥ 10.0).");
  } else {
    tsNotes.push("High-resolution timestamps are not expected on this version; second precision assumed.");
  }
  if (atLeast(v, "11.1")) {
    tsNotes.push("System/HIP log families may carry high-resolution timestamps (≥ 11.1).");
  } else {
    tsNotes.push("System/HIP high-resolution timestamps not expected (< 11.1); placeholder values possible.");
  }

  // Decryption awareness.
  if (atLeast(v, "12.1")) {
    decNotes.push("Decryption fields with improved client/server separation expected (≥ 12.1.2 where applicable).");
  } else if (atLeast(v, "11.1")) {
    decNotes.push("Dedicated decryption logs are applicable on this version (≥ 11.1).");
  } else {
    decNotes.push("Dedicated decryption logs are not expected on this version (< 11.1) — their absence is not a finding.");
  }

  return {
    detectedVersion: v.raw,
    versionKnown: true,
    gpServiceLog: gpLog,
    expectedProcesses: processes,
    timestampNotes: tsNotes,
    decryptionNotes: decNotes,
    parserDecisions: decisions,
  };
}
