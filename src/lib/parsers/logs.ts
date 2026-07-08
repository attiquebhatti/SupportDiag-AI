import { BaseParser, ParserArtifact, pathMatchesAny } from "./types";

// System logs: reboots, process restarts, core files.
export const systemLogParser: BaseParser = {
  name: "system-logs",
  supportedPatterns: ["system_log", "system-log", "messages", "dmesg", "show_system_log"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns)) return true;
    return /(reboot|restart|core|panic|crash)/i.test(content) && /\d{4}\/\d{2}\/\d{2}|\w{3}\s+\d+\s+\d+:\d+/.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    const lines = content.split(/\r?\n/);
    const reboots = lines.filter((l) => /reboot|system (?:is )?(?:starting|booting)|unexpected restart/i.test(l));
    const restarts = lines.filter((l) => /process\s+\S+\s+(?:restarted|died|crashed|respawn)/i.test(l));
    const unexpected = lines.filter((l) => /unexpected (?:reboot|shutdown)|power[- ]?loss|kernel panic/i.test(l));
    const coreRefs = lines.filter((l) => /core(?:file)?\b.*(?:generated|found|dumped)/i.test(l));

    return [
      {
        parserName: this.name,
        artifactType: "system-events",
        dataJson: {
          rebootCount: reboots.length,
          processRestartCount: restarts.length,
          unexpectedRebootCount: unexpected.length,
          coreReferences: coreRefs.slice(-10),
          recentRestarts: restarts.slice(-10),
          recentReboots: reboots.slice(-10),
        },
        sourceFilePath: filePath,
      },
    ];
  },
};

// Core file listing (dedicated `ls` of crash directories in the bundle).
export const coreFileParser: BaseParser = {
  name: "core-files",
  supportedPatterns: ["core", "crashinfo", "crash_info", "/cores/"],
  canParse(filePath) {
    return /cores?\/|crashinfo|core_/i.test(filePath);
  },
  parse(filePath, content): ParserArtifact[] {
    const coreFiles = content
      .split(/\r?\n/)
      .filter((l) => /\.core\b|core\.\d+|core_/i.test(l));
    return [
      {
        parserName: this.name,
        artifactType: "core-files",
        dataJson: { count: coreFiles.length, files: coreFiles.slice(0, 50) },
        sourceFilePath: filePath,
      },
    ];
  },
};
