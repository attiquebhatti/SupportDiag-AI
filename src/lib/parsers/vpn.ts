import { BaseParser, ParserArtifact, pathMatchesAny } from "./types";

// IPSec tunnel status (`show vpn ipsec-sa` / `show vpn tunnel`).
export const ipsecStatusParser: BaseParser = {
  name: "ipsec-vpn-status",
  supportedPatterns: ["ipsec", "vpn_tunnel", "vpn-flow", "show_vpn"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns) && /tunnel|ipsec/i.test(content)) return true;
    return /IPSec\s+SA|tunnel\s+monitor/i.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    const tunnels: Array<{ name: string; state: string; up: boolean; monitor?: string }> = [];
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/([A-Za-z0-9_.\-]+)\s+.*?\b(active|up|down|inactive|init)\b/i);
      if (m && /tunnel|ipsec|sa\b/i.test(line)) {
        const state = m[2].toLowerCase();
        tunnels.push({ name: m[1], state, up: /active|up/.test(state) });
      }
    }
    const monitorDown = [...content.matchAll(/tunnel[\s-]?monitor[\s\S]{0,40}?(down|fail)/gi)].length > 0;
    return [
      {
        parserName: this.name,
        artifactType: "ipsec-status",
        dataJson: {
          tunnelCount: tunnels.length,
          down: tunnels.filter((t) => !t.up),
          monitorFailure: monitorDown,
          tunnels,
        },
        sourceFilePath: filePath,
      },
    ];
  },
};

// IKE gateway status (`show vpn ike-sa` / `show vpn gateway`).
export const ikeStatusParser: BaseParser = {
  name: "ike-status",
  supportedPatterns: ["ike", "vpn_gateway", "ike-sa"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns) && /gateway|ike/i.test(content)) return true;
    return /IKE\s+(?:SA|gateway)/i.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    const gateways: Array<{ name: string; state: string; up: boolean }> = [];
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/([A-Za-z0-9_.\-]+)\s+.*?\b(established|up|down|init|inactive)\b/i);
      if (m && /gateway|ike|peer/i.test(line)) {
        const state = m[2].toLowerCase();
        gateways.push({ name: m[1], state, up: /established|up/.test(state) });
      }
    }
    return [
      {
        parserName: this.name,
        artifactType: "ike-status",
        dataJson: {
          gatewayCount: gateways.length,
          down: gateways.filter((g) => !g.up),
          gateways,
        },
        sourceFilePath: filePath,
      },
    ];
  },
};
