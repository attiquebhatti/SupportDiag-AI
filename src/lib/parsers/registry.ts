import { BaseParser, ParserArtifact } from "./types";
import { parsers as panosParsers } from "./index";
import { panoramaDeviceParser } from "./panorama-device";
import { cortexXdrParser, cortexXsiamParser } from "./cortex";
import { genericLogParser } from "./generic-log";
import type { Maturity } from "../vendors";

// VendorParserRegistry — maps a detected product id to the parser modules that
// should run for it. PAN-OS/Panorama reuse the mature shared PAN parsers; Cortex
// products use flexible keyword parsers; the generic-log parser always runs as a
// fallback so unknown bundles still yield evidence.

export interface ParserModuleMeta {
  parserName: string;
  vendor: string;
  product: string;
  maturity: Maturity;
}

interface ProductParserSet {
  parsers: BaseParser[];
  maturity: Maturity;
}

export const PARSER_REGISTRY: Record<string, ProductParserSet> = {
  panos_ngfw: { parsers: panosParsers, maturity: "high" },
  panorama: { parsers: [...panosParsers, panoramaDeviceParser], maturity: "medium" },
  cortex_xdr: { parsers: [cortexXdrParser, genericLogParser], maturity: "low" },
  cortex_xsiam: { parsers: [cortexXsiamParser, genericLogParser], maturity: "low" },
  // Phase 2 placeholders — generic analysis until dedicated parsers land.
  cp_gateway: { parsers: [genericLogParser], maturity: "low" },
  cp_management: { parsers: [genericLogParser], maturity: "low" },
  cp_maestro_vsx: { parsers: [genericLogParser], maturity: "low" },
  fortigate: { parsers: [genericLogParser], maturity: "low" },
  fortimanager: { parsers: [genericLogParser], maturity: "low" },
  fortianalyzer: { parsers: [genericLogParser], maturity: "low" },
};

export interface IndexedFile {
  path: string;
  content: string;
}

/**
 * Run the parser set for a detected product (or a sensible fallback). Always
 * includes the generic-log parser. Tags each artifact with vendor/product.
 */
export function runParsersForProduct(
  vendor: string | null,
  product: string | null,
  files: IndexedFile[]
): ParserArtifact[] {
  const set = product ? PARSER_REGISTRY[product] : undefined;
  // Fallback: unknown product → run all PAN parsers + generic (best effort).
  const parserList = set ? set.parsers : [...panosParsers, genericLogParser];
  // De-duplicate parser instances.
  const unique = Array.from(new Set(parserList));

  const artifacts: ParserArtifact[] = [];
  for (const file of files) {
    if (!file.content) continue;
    for (const parser of unique) {
      let applicable = false;
      try {
        applicable = parser.canParse(file.path, file.content);
      } catch {
        applicable = false;
      }
      if (!applicable) continue;
      try {
        const produced = parser.parse(file.path, file.content);
        for (const a of produced) {
          artifacts.push({ ...a, vendor: vendor ?? undefined, product: product ?? undefined } as ParserArtifact);
        }
      } catch {
        // isolate parser failures
      }
    }
  }
  return artifacts;
}

// Full parser catalog for the Vendor Parsers page / DB seed.
export const PARSER_CATALOG: ParserModuleMeta[] = [
  { parserName: "paloAltoPanosParser", vendor: "palo_alto", product: "panos_ngfw", maturity: "high" },
  { parserName: "paloAltoPanoramaParser", vendor: "palo_alto", product: "panorama", maturity: "medium" },
  { parserName: "paloAltoCortexXdrParser", vendor: "palo_alto", product: "cortex_xdr", maturity: "low" },
  { parserName: "paloAltoXsiamParser", vendor: "palo_alto", product: "cortex_xsiam", maturity: "low" },
  { parserName: "checkpointGatewayParser", vendor: "check_point", product: "cp_gateway", maturity: "low" },
  { parserName: "checkpointManagementParser", vendor: "check_point", product: "cp_management", maturity: "low" },
  { parserName: "fortigateParser", vendor: "fortinet", product: "fortigate", maturity: "low" },
  { parserName: "fortimanagerParser", vendor: "fortinet", product: "fortimanager", maturity: "low" },
  { parserName: "fortianalyzerParser", vendor: "fortinet", product: "fortianalyzer", maturity: "low" },
];
