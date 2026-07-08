import { BaseParser, ParserArtifact, pathMatchesAny } from "./types";

// Routing table: default route presence + route count.
export const routingTableParser: BaseParser = {
  name: "routing-table",
  supportedPatterns: ["routing_route", "route_table", "show_routing", "fib", "routing-route"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns)) return true;
    return /destination.*nexthop|flags:.*A\?C\?H/i.test(content) && /0\.0\.0\.0\/0/.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    const hasDefaultRoute = /(^|\s)0\.0\.0\.0\/0\s/m.test(content);
    const routeLines = content.split(/\r?\n/).filter((l) => /\d+\.\d+\.\d+\.\d+\/\d+/.test(l));
    return [
      {
        parserName: this.name,
        artifactType: "routing-table",
        dataJson: { hasDefaultRoute, routeCount: routeLines.length },
        sourceFilePath: filePath,
      },
    ];
  },
};

// BGP peer summary.
export const bgpStatusParser: BaseParser = {
  name: "bgp-status",
  supportedPatterns: ["bgp", "routing_protocol_bgp"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns) && /peer|neighbor/i.test(content)) return true;
    return /BGP\s+(?:peer|neighbor)/i.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    const peers: Array<{ peer: string; state: string; up: boolean }> = [];
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/(\d+\.\d+\.\d+\.\d+)\s+.*?\b(Established|Active|Idle|Connect|OpenSent|OpenConfirm)\b/i);
      if (m) {
        peers.push({ peer: m[1], state: m[2], up: /Established/i.test(m[2]) });
      }
    }
    return [
      {
        parserName: this.name,
        artifactType: "bgp-status",
        dataJson: {
          peerCount: peers.length,
          down: peers.filter((p) => !p.up),
          peers,
        },
        sourceFilePath: filePath,
      },
    ];
  },
};

// OSPF neighbor summary.
export const ospfStatusParser: BaseParser = {
  name: "ospf-status",
  supportedPatterns: ["ospf", "routing_protocol_ospf"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns) && /neighbor/i.test(content)) return true;
    return /OSPF\s+neighbor/i.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    const neighbors: Array<{ neighbor: string; state: string; full: boolean }> = [];
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/(\d+\.\d+\.\d+\.\d+)\s+.*?\b(Full|Init|2-Way|ExStart|Exchange|Loading|Down|Attempt)\b/i);
      if (m) {
        neighbors.push({ neighbor: m[1], state: m[2], full: /Full/i.test(m[2]) });
      }
    }
    return [
      {
        parserName: this.name,
        artifactType: "ospf-status",
        dataJson: {
          neighborCount: neighbors.length,
          down: neighbors.filter((n) => !n.full),
          neighbors,
        },
        sourceFilePath: filePath,
      },
    ];
  },
};
