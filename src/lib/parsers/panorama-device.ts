import { BaseParser, ParserArtifact, pathMatchesAny } from "./types";

// Panorama-specific parser: managed devices, commit-all, template/device-group,
// plugin versions, and log collector references. Complements the shared PAN-OS
// parsers (system-info, commit-logs, resources) when the product is Panorama.
export const panoramaDeviceParser: BaseParser = {
  name: "panorama-management",
  supportedPatterns: ["devices_all", "show_devices", "commit-all", "template-stack", "device-group", "log-collector", "managed"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns)) return true;
    return /<device-group>|<template-stack>|commit-all|managed devices?/i.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    const lines = content.split(/\r?\n/);

    const deviceGroups = Array.from(new Set([...content.matchAll(/<device-group>\s*<entry name="([^"]+)"/gi)].map((m) => m[1])));
    const templateStacks = Array.from(new Set([...content.matchAll(/<template-stack>\s*<entry name="([^"]+)"/gi)].map((m) => m[1])));

    // Connectivity: lines indicating a managed device disconnected/unreachable.
    const disconnects = lines.filter((l) => /(disconnected|not connected|unreachable|connection.*(down|lost))/i.test(l) && /device|firewall|serial/i.test(l));
    // Commit-all outcomes.
    const commitAllFailures = lines.filter((l) => /commit-all/i.test(l) && /(fail|error)/i.test(l));
    // Plugin versions (name: version).
    const plugins = [...content.matchAll(/plugin[s]?[:\s]+([a-z0-9_\-]+)\s*[:=]?\s*([0-9][0-9.\-]+)/gi)].map((m) => ({ name: m[1], version: m[2] }));

    return [
      {
        parserName: this.name,
        artifactType: "panorama-management",
        dataJson: {
          deviceGroupCount: deviceGroups.length,
          deviceGroups: deviceGroups.slice(0, 50),
          templateStackCount: templateStacks.length,
          templateStacks: templateStacks.slice(0, 50),
          disconnectedDevices: disconnects.slice(0, 20),
          disconnectedCount: disconnects.length,
          commitAllFailures: commitAllFailures.slice(0, 10),
          commitAllFailureCount: commitAllFailures.length,
          plugins: plugins.slice(0, 30),
        },
        sourceFilePath: filePath,
      },
    ];
  },
};
