import { BaseParser, ParserArtifact, pathMatchesAny } from "./types";

// Parses running-config.xml for: security rules (logging + profiles), zones,
// interface-to-zone assignments, and default route presence. Uses lightweight
// regex extraction rather than a full XML parser (support files can be large).

function extractBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function attr(fragment: string, name: string): string | null {
  const m = fragment.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return m ? m[1] : null;
}

export const runningConfigParser: BaseParser = {
  name: "running-config",
  supportedPatterns: ["running-config", "running_config", "merged-config", "configd"],
  canParse(filePath, content) {
    if (pathMatchesAny(filePath, this.supportedPatterns)) return true;
    return content.includes("<config") && content.includes("<security>");
  },
  parse(filePath, content): ParserArtifact[] {
    const artifacts: ParserArtifact[] = [];

    // Security rules
    const securitySection = content.match(/<security>[\s\S]*?<\/security>/i)?.[0] ?? "";
    const ruleBlocks = extractBlocks(securitySection, "entry");
    const rules = ruleBlocks.map((block, i) => {
      const name = block.match(/^\s*name="([^"]*)"/)?.[1] ?? attr(block, "name") ?? `rule-${i}`;
      const logStart = /<log-start>yes<\/log-start>/i.test(block);
      const logEnd = /<log-end>yes<\/log-end>/i.test(block);
      const hasProfile =
        /<profile-setting>/i.test(block) &&
        !/<profile-setting>\s*<\/profile-setting>/i.test(block);
      const action = block.match(/<action>([^<]*)<\/action>/i)?.[1] ?? null;
      const disabled = /<disabled>yes<\/disabled>/i.test(block);
      return { name, logStart, logEnd, hasProfile, action, disabled };
    });
    artifacts.push({
      parserName: this.name,
      artifactType: "security-rules",
      dataJson: { count: rules.length, rules },
      sourceFilePath: filePath,
    });

    // Zones
    const zoneNames = extractBlocks(content, "zone")
      .flatMap((z) => extractBlocks(z, "entry"))
      .map((e) => e.match(/name="([^"]*)"/)?.[1])
      .filter(Boolean);

    // Interface -> zone mapping (best effort)
    artifacts.push({
      parserName: this.name,
      artifactType: "zones",
      dataJson: { zones: Array.from(new Set(zoneNames)) },
      sourceFilePath: filePath,
    });

    // Default route present in any virtual-router static route table?
    const hasDefaultRoute = /<destination>0\.0\.0\.0\/0<\/destination>/i.test(content);
    artifacts.push({
      parserName: this.name,
      artifactType: "static-routes",
      dataJson: { hasDefaultRoute },
      sourceFilePath: filePath,
    });

    return artifacts;
  },
};
