import { BaseParser, ParserArtifact, pathMatchesAny } from "./types";

// License information (`request license info` / `show system info` licenses).
export const licenseParser: BaseParser = {
  name: "license-info",
  supportedPatterns: ["license", "request_license"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns)) return true;
    return /Feature:\s|Expires:\s/i.test(content) && /license/i.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    const licenses: Array<{ feature: string; expires: string; expired: boolean }> = [];
    // PAN-OS license blocks: "Feature: Threat Prevention ... Expires: July 01, 2025"
    const blocks = content.split(/\n(?=Feature:)/i);
    for (const block of blocks) {
      const feature = block.match(/Feature:\s*(.+)/i)?.[1]?.trim();
      const expires = block.match(/Expires?:\s*(.+)/i)?.[1]?.trim();
      if (feature) {
        let expired = false;
        if (expires && !/never/i.test(expires)) {
          const d = new Date(expires);
          if (!isNaN(d.getTime())) expired = d.getTime() < Date.now();
        }
        licenses.push({ feature, expires: expires ?? "unknown", expired });
      }
    }
    return [
      {
        parserName: this.name,
        artifactType: "licenses",
        dataJson: {
          count: licenses.length,
          expired: licenses.filter((l) => l.expired),
          licenses,
        },
        sourceFilePath: filePath,
      },
    ];
  },
};

// Content update versions (`request content upgrade info`, `show system info`).
export const contentVersionParser: BaseParser = {
  name: "content-versions",
  supportedPatterns: ["content_upgrade", "content-version", "request_content", "update_info"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns)) return true;
    return /app-version|threat-version|wildfire-version/i.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    function ver(re: RegExp): { version: string | null; date: string | null } {
      const m = content.match(re);
      if (!m) return { version: null, date: null };
      const version = m[1]?.trim() ?? null;
      // Dates often appear as 8-digit yyyymmdd inside version strings "8888-1234"
      const dateStr = version?.match(/^(\d{4})-\d+/) ? null : null;
      return { version, date: dateStr };
    }
    const data = {
      app: ver(/app-version:\s*([0-9.\-]+)/i),
      threat: ver(/threat-version:\s*([0-9.\-]+)/i),
      antivirus: ver(/av-version:\s*([0-9.\-]+)/i),
      wildfire: ver(/wildfire-version:\s*([0-9.\-]+)/i),
      urlFiltering: ver(/url-filtering-version:\s*([0-9.\-A-Za-z]+)/i),
    };
    return [
      {
        parserName: this.name,
        artifactType: "content-versions",
        dataJson: data,
        sourceFilePath: filePath,
      },
    ];
  },
};
