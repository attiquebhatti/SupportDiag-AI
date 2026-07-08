import { BaseParser, ParserArtifact, pathMatchesAny, parseKeyValues } from "./types";

// Parses `show high-availability all / state` output.
export const haStatusParser: BaseParser = {
  name: "ha-status",
  supportedPatterns: ["high-availability", "high_availability", "ha_state", "ha-state", "show_ha"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns)) return true;
    return /high availability|HA Enabled|Local Information|Peer Information/i.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    const kv = parseKeyValues(content);
    const enabled = /enabled\s*:\s*yes/i.test(content) || /HA Enabled/i.test(content);
    const localState =
      content.match(/State:\s*([A-Za-z-]+)/i)?.[1] ??
      kv["state"] ??
      null;
    const peerState = content.match(/Peer[\s\S]{0,200}?State:\s*([A-Za-z-]+)/i)?.[1] ?? null;
    const runningSync =
      content.match(/Running Sync:\s*([A-Za-z ]+)/i)?.[1]?.trim() ??
      kv["running_sync"] ??
      null;
    const configSync =
      content.match(/Config Sync(?:hronization)?:\s*([A-Za-z ]+)/i)?.[1]?.trim() ?? null;
    const pathMonitor =
      content.match(/Path Monitoring[\s\S]{0,60}?:\s*([A-Za-z]+)/i)?.[1] ?? null;
    const linkMonitor =
      content.match(/Link Monitoring[\s\S]{0,60}?:\s*([A-Za-z]+)/i)?.[1] ?? null;

    return [
      {
        parserName: this.name,
        artifactType: "ha-status",
        dataJson: {
          enabled,
          localState,
          peerState,
          runningSync,
          configSync,
          pathMonitorStatus: pathMonitor,
          linkMonitorStatus: linkMonitor,
          suspended: /suspended/i.test(localState ?? ""),
        },
        sourceFilePath: filePath,
      },
    ];
  },
};
