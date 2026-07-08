import { BaseParser, ParserArtifact } from "./types";
import { systemInfoParser } from "./system";
import { runningConfigParser } from "./config";
import { haStatusParser } from "./ha";
import { interfaceStatusParser } from "./interfaces";
import { routingTableParser, bgpStatusParser, ospfStatusParser } from "./routing";
import { ipsecStatusParser, ikeStatusParser } from "./vpn";
import { licenseParser, contentVersionParser } from "./licensing";
import { panoramaStatusParser } from "./panorama";
import { commitLogParser } from "./commits";
import { systemLogParser, coreFileParser } from "./logs";
import { mgmtResourceParser, dataResourceParser } from "./resources";

export const parsers: BaseParser[] = [
  systemInfoParser,
  runningConfigParser,
  haStatusParser,
  interfaceStatusParser,
  routingTableParser,
  bgpStatusParser,
  ospfStatusParser,
  ipsecStatusParser,
  ikeStatusParser,
  licenseParser,
  contentVersionParser,
  panoramaStatusParser,
  commitLogParser,
  systemLogParser,
  coreFileParser,
  mgmtResourceParser,
  dataResourceParser,
];

export interface IndexedFile {
  path: string;
  content: string;
}

/** Run every applicable parser across the indexed text files. */
export function runParsers(files: IndexedFile[]): ParserArtifact[] {
  const artifacts: ParserArtifact[] = [];
  for (const file of files) {
    if (!file.content) continue;
    for (const parser of parsers) {
      let applicable = false;
      try {
        applicable = parser.canParse(file.path, file.content);
      } catch {
        applicable = false;
      }
      if (!applicable) continue;
      try {
        artifacts.push(...parser.parse(file.path, file.content));
      } catch {
        // A single parser failure must not abort the whole analysis.
      }
    }
  }
  return artifacts;
}

export interface DeviceInfo {
  hostname: string | null;
  serialNumber: string | null;
  model: string | null;
  panosVersion: string | null;
  deviceType: string | null;
  uptime: string | null;
  haStatus: string | null;
  panoramaManaged: boolean;
  panoramaServer: string | null;
  lastCommitStatus: string | null;
}

/** Derive a consolidated Device record from parsed artifacts. */
export function deriveDevice(artifacts: ParserArtifact[]): DeviceInfo {
  const byType = (t: string) => artifacts.find((a) => a.artifactType === t)?.dataJson ?? {};
  const sys = byType("system-info") as Record<string, unknown>;
  const ha = byType("ha-status") as Record<string, unknown>;
  const pano = byType("panorama-status") as Record<string, unknown>;
  const commit = byType("commit-logs") as Record<string, unknown>;

  const haStatus = ha.enabled
    ? `${(ha.localState as string) ?? "enabled"}${ha.peerState ? ` / peer ${ha.peerState}` : ""}`
    : "disabled";

  return {
    hostname: (sys.hostname as string) ?? null,
    serialNumber: (sys.serialNumber as string) ?? null,
    model: (sys.model as string) ?? null,
    panosVersion: (sys.panosVersion as string) ?? null,
    deviceType: (sys.deviceType as string) ?? (sys.family as string) ?? null,
    uptime: (sys.uptime as string) ?? null,
    haStatus,
    panoramaManaged: Boolean(pano.managed),
    panoramaServer: (pano.server as string) ?? null,
    lastCommitStatus: (commit.lastStatus as string) ?? null,
  };
}

export * from "./types";
