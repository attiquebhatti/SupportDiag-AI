import { BaseParser, ParserArtifact, pathMatchesAny, parseKeyValues } from "./types";

// Parses `show system info` output (device identity + versions).
export const systemInfoParser: BaseParser = {
  name: "system-info",
  supportedPatterns: ["system_info", "system-info", "sysinfo", "show_system"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns)) return true;
    return /hostname\s*:/.test(content) && /sw-version\s*:/.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    const kv = parseKeyValues(content);
    const data = {
      hostname: kv["hostname"] ?? kv["devicename"] ?? null,
      serialNumber: kv["serial"] ?? kv["serial_number"] ?? null,
      model: kv["model"] ?? null,
      panosVersion: kv["sw-version"] ?? kv["sw_version"] ?? kv["software_version"] ?? null,
      family: kv["family"] ?? null,
      uptime: kv["uptime"] ?? null,
      deviceType: kv["device-type"] ?? kv["device_type"] ?? kv["vm-mode"] ?? null,
      multiVsys: kv["multi-vsys"] ?? kv["multi_vsys"] ?? null,
      operationalMode: kv["operational-mode"] ?? kv["operational_mode"] ?? null,
      appVersion: kv["app-version"] ?? kv["app_version"] ?? null,
      threatVersion: kv["threat-version"] ?? kv["threat_version"] ?? null,
      avVersion: kv["av-version"] ?? kv["av_version"] ?? null,
      wildfireVersion: kv["wildfire-version"] ?? kv["wildfire_version"] ?? null,
      urlFilteringVersion: kv["url-filtering-version"] ?? null,
    };
    return [
      {
        parserName: this.name,
        artifactType: "system-info",
        dataJson: data,
        sourceFilePath: filePath,
      },
    ];
  },
};
