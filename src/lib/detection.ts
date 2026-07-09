import type { VendorId, Maturity } from "./vendors";

// Vendor / product auto-detection from archive structure, filenames, and text
// content. Produces a normalized result plus a confidence score used for the
// "parser confidence" indicator in the UI.

export interface DetectionInput {
  files: Array<{ path: string; content: string | null }>;
  selectedVendor?: string | null; // user hint (may be "auto")
  selectedProduct?: string | null;
}

export interface DetectionResult {
  vendor: VendorId | null;
  product: string | null;
  confidence: number; // 0-100
  level: Maturity;
  signals: string[]; // human-readable evidence for why we detected this
}

interface Signal {
  vendor: VendorId;
  product: string;
  weight: number;
  test: (haystack: string, paths: string) => boolean;
  reason: string;
}

const SIGNALS: Signal[] = [
  // --- Palo Alto PAN-OS NGFW ---
  { vendor: "palo_alto", product: "panos_ngfw", weight: 40, reason: "PA- model + sw-version in system info", test: (h) => /model:\s*pa-/i.test(h) && /sw-version:/i.test(h) },
  { vendor: "palo_alto", product: "panos_ngfw", weight: 20, reason: "running-config.xml present", test: (_h, p) => /running-config\.xml/i.test(p) },
  { vendor: "palo_alto", product: "panos_ngfw", weight: 15, reason: "high-availability output present", test: (h, p) => /high-availability/i.test(p) || /HA Enabled/i.test(h) },
  // --- Palo Alto Panorama ---
  { vendor: "palo_alto", product: "panorama", weight: 45, reason: "Panorama model / device-group / template-stack", test: (h) => /model:\s*panorama/i.test(h) || (/<device-group>/i.test(h) && /<template-stack>/i.test(h)) },
  { vendor: "palo_alto", product: "panorama", weight: 20, reason: "commit-all / managed devices references", test: (h) => /commit-all/i.test(h) && /managed devices?/i.test(h) },
  // --- Cortex XDR ---
  { vendor: "palo_alto", product: "cortex_xdr", weight: 35, reason: "Cortex XDR / Traps / cyserver references", test: (h, p) => /cortex\s*xdr|\btraps\b|cyserver|cytool/i.test(h) || /xdr|traps/i.test(p) },
  { vendor: "palo_alto", product: "cortex_xdr", weight: 20, reason: "Broker VM references", test: (h) => /broker\s*vm|applet.*broker/i.test(h) },
  // --- Cortex XSIAM ---
  { vendor: "palo_alto", product: "cortex_xsiam", weight: 40, reason: "XSIAM / XQL / dataset / ingestion references", test: (h, p) => /xsiam|xql|correlation rule|ingest(ion)?\b/i.test(h) || /xsiam|xql/i.test(p) },
  // --- Check Point ---
  { vendor: "check_point", product: "cp_gateway", weight: 40, reason: "CPInfo / clusterXL / cpstat references", test: (h, p) => /cpinfo|clusterxl|cpstat|\bfw ctl\b|gaia/i.test(h) || /cpinfo/i.test(p) },
  { vendor: "check_point", product: "cp_management", weight: 15, reason: "Check Point management (fwm / cpm) references", test: (h) => /\bfwm\b|cpm\.elg|smartcenter|management server/i.test(h) },
  // --- Fortinet FortiGate ---
  { vendor: "fortinet", product: "fortigate", weight: 40, reason: "FortiGate / FortiOS / get system status references", test: (h, p) => /fortigate|fortios|get system status|conserve mode/i.test(h) || /fortigate|fgt_/i.test(p) },
  { vendor: "fortinet", product: "fortimanager", weight: 20, reason: "FortiManager references", test: (h) => /fortimanager|fmg_/i.test(h) },
];

function sampleContent(files: DetectionInput["files"], maxBytes = 400_000): string {
  // Concatenate a bounded sample of file content for signal matching.
  let buf = "";
  for (const f of files) {
    if (!f.content) continue;
    buf += "\n" + f.content.slice(0, 8000);
    if (buf.length >= maxBytes) break;
  }
  return buf;
}

export function detectVendorProduct(input: DetectionInput): DetectionResult {
  const paths = input.files.map((f) => f.path).join("\n");
  const haystack = sampleContent(input.files);

  // Tally weighted scores per (vendor, product).
  const scores = new Map<string, { vendor: VendorId; product: string; score: number; reasons: string[] }>();
  for (const s of SIGNALS) {
    let matched = false;
    try {
      matched = s.test(haystack, paths);
    } catch {
      matched = false;
    }
    if (!matched) continue;
    const key = `${s.vendor}:${s.product}`;
    const entry = scores.get(key) ?? { vendor: s.vendor, product: s.product, score: 0, reasons: [] };
    entry.score += s.weight;
    entry.reasons.push(s.reason);
    scores.set(key, entry);
  }

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score);
  const best = ranked[0];

  // Honor an explicit user selection as an override/booster.
  const userVendor = input.selectedVendor && input.selectedVendor !== "auto" ? (input.selectedVendor as VendorId) : null;
  const userProduct = input.selectedProduct && input.selectedProduct !== "auto" ? input.selectedProduct : null;

  if (userProduct) {
    const detectedMatchesUser = best && `${best.vendor}:${best.product}` === `${userVendor ?? best.vendor}:${userProduct}`;
    const confidence = Math.min(100, (best?.score ?? 0) + (detectedMatchesUser ? 30 : 20));
    return {
      vendor: userVendor ?? best?.vendor ?? null,
      product: userProduct,
      confidence,
      level: level(confidence),
      signals: [
        `User selected product: ${userProduct}`,
        ...(best?.reasons ?? []).slice(0, 3),
      ],
    };
  }

  if (!best) {
    // No signals — fall back to a generic log analysis posture.
    return {
      vendor: userVendor,
      product: userVendor ? null : null,
      confidence: userVendor ? 25 : 10,
      level: "low",
      signals: userVendor ? [`User selected vendor: ${userVendor}`] : ["No vendor signals detected — generic log analysis"],
    };
  }

  const confidence = Math.min(100, best.score);
  return {
    vendor: best.vendor,
    product: best.product,
    confidence,
    level: level(confidence),
    signals: best.reasons.slice(0, 4),
  };
}

function level(confidence: number): Maturity {
  if (confidence >= 60) return "high";
  if (confidence >= 30) return "medium";
  return "low";
}
