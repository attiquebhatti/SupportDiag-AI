import { BaseParser, ParserArtifact, pathMatchesAny, parseKeyValues } from "./types";

// Panorama connection status (`show panorama-status`).
export const panoramaStatusParser: BaseParser = {
  name: "panorama-status",
  supportedPatterns: ["panorama", "panorama-status", "panorama_status"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns)) return true;
    return /Panorama Server|Connected\s*:\s*(yes|no)/i.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    const kv = parseKeyValues(content);
    const servers = [...content.matchAll(/Panorama Server\s*\d*\s*:\s*([^\s]+)/gi)].map((m) => m[1]);
    const connected =
      /Connected\s*:\s*yes/i.test(content) ||
      /panorama[\s\S]{0,40}connected/i.test(content);
    const managed = servers.length > 0 || /panorama/i.test(content);
    const pushPending = /commit-all|push[\s\S]{0,20}pending/i.test(content);
    return [
      {
        parserName: this.name,
        artifactType: "panorama-status",
        dataJson: {
          managed,
          connected,
          servers,
          server: servers[0] ?? kv["panorama_server"] ?? null,
          pushPending,
        },
        sourceFilePath: filePath,
      },
    ];
  },
};
