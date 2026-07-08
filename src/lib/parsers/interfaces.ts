import { BaseParser, ParserArtifact, pathMatchesAny } from "./types";

// Parses `show interface all` / hardware interface counters.
export const interfaceStatusParser: BaseParser = {
  name: "interface-status",
  supportedPatterns: ["interface_all", "interface-all", "show_interface", "interface_hardware"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns)) return true;
    return /^(name|Interface)\s+.*(state|status)/im.test(content) && /ethernet\d|ae\d/i.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    const interfaces: Array<{
      name: string;
      state: string;
      up: boolean;
      errors: number;
    }> = [];

    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      // Match interface rows: "ethernet1/1  up ..." / "ethernet1/2 down"
      const m = line.match(/^\s*(ethernet\d+\/\d+|ae\d+|tunnel(?:\.\d+)?|vlan(?:\.\d+)?|loopback)\b\s+(\S+)/i);
      if (m) {
        const state = m[2].toLowerCase();
        const up = /up|active/.test(state);
        // Try to read error/drop counters from the same line if present.
        const nums = line.match(/\berrors?\s+(\d+)/i);
        interfaces.push({
          name: m[1],
          state,
          up,
          errors: nums ? parseInt(nums[1], 10) : 0,
        });
      }
    }

    // Aggregate error counters from "show interface counters" style tables.
    const errorMatches = [...content.matchAll(/(ethernet\d+\/\d+)[\s\S]{0,200}?(?:in-errors|rx-errors|errors)\s+(\d+)/gi)];
    for (const em of errorMatches) {
      const found = interfaces.find((i) => i.name === em[1]);
      const errs = parseInt(em[2], 10);
      if (found) found.errors = Math.max(found.errors, errs);
    }

    return [
      {
        parserName: this.name,
        artifactType: "interface-status",
        dataJson: {
          count: interfaces.length,
          down: interfaces.filter((i) => !i.up).map((i) => i.name),
          withErrors: interfaces.filter((i) => i.errors > 0),
          interfaces,
        },
        sourceFilePath: filePath,
      },
    ];
  },
};
