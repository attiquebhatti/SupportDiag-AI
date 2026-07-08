import { BaseParser, ParserArtifact, pathMatchesAny } from "./types";

function parseCpuPercent(content: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = content.match(re);
    if (m) {
      const v = parseFloat(m[1]);
      if (!isNaN(v)) return v;
    }
  }
  return null;
}

// Management-plane resource usage (`show system resources`, top output).
export const mgmtResourceParser: BaseParser = {
  name: "mp-resources",
  supportedPatterns: ["system_resources", "system-resources", "management_plane", "show_system_resources", "top"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns)) return true;
    return /%Cpu|Cpu\(s\)|Mem\s*:|KiB Mem/i.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    // `top`: "%Cpu(s):  5.0 us,  2.0 sy ...  90.0 id"
    const idle = parseCpuPercent(content, [/(\d+(?:\.\d+)?)\s*(?:%?\s*)?id\b/i]);
    const cpu = idle != null ? Math.max(0, 100 - idle) : parseCpuPercent(content, [/cpu[^:]*:\s*(\d+(?:\.\d+)?)\s*%/i]);

    // Memory: "KiB Mem : 8000000 total, 200000 free, 6000000 used"
    const memTotal = content.match(/Mem\s*:?\s*(\d+)\s*(?:k|K)?\s*total/i)?.[1];
    const memUsed = content.match(/(\d+)\s*(?:k|K)?\s*used/i)?.[1];
    let memPercent: number | null = null;
    if (memTotal && memUsed) {
      const t = parseInt(memTotal, 10);
      const u = parseInt(memUsed, 10);
      if (t > 0) memPercent = Math.round((u / t) * 100);
    }

    // Disk usage: "/dev/root  ...  85%  /"
    const diskMatches = [...content.matchAll(/(\S+)\s+[\d.]+[KMGT]?\s+[\d.]+[KMGT]?\s+[\d.]+[KMGT]?\s+(\d+)%\s+(\/\S*)/g)];
    const disks = diskMatches.map((m) => ({
      filesystem: m[1],
      usedPercent: parseInt(m[2], 10),
      mount: m[3],
    }));
    const maxDisk = disks.reduce((max, d) => Math.max(max, d.usedPercent), 0);

    return [
      {
        parserName: this.name,
        artifactType: "mp-resources",
        dataJson: {
          cpuPercent: cpu,
          memoryPercent: memPercent,
          maxDiskPercent: maxDisk || null,
          disks,
        },
        sourceFilePath: filePath,
      },
    ];
  },
};

// Data-plane resource usage (`show running resource-monitor`).
export const dataResourceParser: BaseParser = {
  name: "dp-resources",
  supportedPatterns: ["resource-monitor", "resource_monitor", "dataplane", "data_plane", "dp_resource"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns)) return true;
    return /resource monitor|data processors|dp\d+ .*cpu/i.test(content);
  },
  parse(filePath, content): ParserArtifact[] {
    // Average CPU load lines: "Core 0 ... 75%" or "avg ... 80"
    const cores = [...content.matchAll(/core\s+\d+[^\d]*(\d+(?:\.\d+)?)/gi)].map((m) => parseFloat(m[1]));
    const avgMatch = content.match(/average[^\d]*(\d+(?:\.\d+)?)/i);
    const maxCore = cores.length ? Math.max(...cores) : null;
    const avg = avgMatch ? parseFloat(avgMatch[1]) : (cores.length ? cores.reduce((a, b) => a + b, 0) / cores.length : null);
    return [
      {
        parserName: this.name,
        artifactType: "dp-resources",
        dataJson: {
          maxCorePercent: maxCore,
          avgCorePercent: avg != null ? Math.round(avg) : null,
          coreCount: cores.length,
        },
        sourceFilePath: filePath,
      },
    ];
  },
};
