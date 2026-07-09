// Canonical multi-vendor / multi-product taxonomy. Shared by server and client
// (pure data — no server-only imports). Icons are stored as Lucide icon *names*
// and mapped to components in the UI layer.

export type VendorId = "palo_alto" | "check_point" | "fortinet";
export type ProductStatus = "supported" | "beta" | "planned";
export type Maturity = "high" | "medium" | "low";

export interface ProductDef {
  id: string;
  label: string;
  shortLabel: string;
  vendor: VendorId;
  status: ProductStatus;
  maturity: Maturity;
  icon: string; // Lucide icon name
  blurb: string;
  suggestedQuestions: string[];
}

export interface VendorDef {
  id: VendorId;
  label: string;
  shortLabel: string;
  accent: string; // hsl triplet used for badges/gradients
  icon: string;
}

export const VENDORS: Record<VendorId, VendorDef> = {
  palo_alto: { id: "palo_alto", label: "Palo Alto Networks", shortLabel: "Palo Alto", accent: "18 95% 55%", icon: "Flame" },
  check_point: { id: "check_point", label: "Check Point", shortLabel: "Check Point", accent: "0 84% 60%", icon: "Shield" },
  fortinet: { id: "fortinet", label: "Fortinet", shortLabel: "Fortinet", accent: "0 72% 45%", icon: "Server" },
};

export const PRODUCTS: ProductDef[] = [
  {
    id: "panos_ngfw",
    label: "NGFW / PAN-OS Firewall",
    shortLabel: "PAN-OS NGFW",
    vendor: "palo_alto",
    status: "supported",
    maturity: "high",
    icon: "Shield",
    blurb: "Next-gen firewall tech support files.",
    suggestedQuestions: [
      "What are the top issues in this support file?",
      "Is HA healthy and in sync?",
      "Are there any commit failures?",
      "Is Panorama connectivity healthy?",
      "Are there VPN tunnel or IKE issues?",
      "Is BGP or OSPF down?",
      "Is the firewall overloaded (CPU/memory)?",
      "What should I troubleshoot first?",
    ],
  },
  {
    id: "panorama",
    label: "Panorama",
    shortLabel: "Panorama",
    vendor: "palo_alto",
    status: "supported",
    maturity: "medium",
    icon: "Network",
    blurb: "Centralized management tech support files.",
    suggestedQuestions: [
      "Are managed devices connected?",
      "Are there commit-all failures?",
      "Are there template or device group push issues?",
      "Are plugins healthy and matched?",
      "Is the log collector healthy?",
    ],
  },
  {
    id: "cortex_xdr",
    label: "Cortex XDR",
    shortLabel: "Cortex XDR",
    vendor: "palo_alto",
    status: "beta",
    maturity: "low",
    icon: "Radar",
    blurb: "XDR agent / broker log bundles.",
    suggestedQuestions: [
      "Are there agent connectivity issues?",
      "Are there Broker VM issues?",
      "Are there policy or content update issues?",
      "Are there data collection errors?",
    ],
  },
  {
    id: "cortex_xsiam",
    label: "Cortex XSIAM",
    shortLabel: "Cortex XSIAM",
    vendor: "palo_alto",
    status: "beta",
    maturity: "low",
    icon: "Database",
    blurb: "XSIAM ingestion / dataset log bundles.",
    suggestedQuestions: [
      "Are there ingestion issues?",
      "Are parsing rules failing?",
      "Are correlation rules failing?",
      "Are there dataset or XQL errors?",
      "What data sources are unhealthy?",
    ],
  },
  {
    id: "cp_gateway",
    label: "Security Gateway",
    shortLabel: "CP Gateway",
    vendor: "check_point",
    status: "planned",
    maturity: "low",
    icon: "Shield",
    blurb: "CPInfo / gateway diagnostics.",
    suggestedQuestions: [
      "Is policy installation failing?",
      "Is SIC healthy?",
      "Is ClusterXL healthy?",
      "Are VPN tunnels down?",
      "Are interfaces or routes problematic?",
    ],
  },
  {
    id: "cp_management",
    label: "Management Server",
    shortLabel: "CP Mgmt",
    vendor: "check_point",
    status: "planned",
    maturity: "low",
    icon: "Network",
    blurb: "Management server diagnostics.",
    suggestedQuestions: ["Are there policy install failures?", "Is SIC trust healthy?"],
  },
  {
    id: "cp_maestro_vsx",
    label: "Maestro / VSX",
    shortLabel: "Maestro/VSX",
    vendor: "check_point",
    status: "planned",
    maturity: "low",
    icon: "Server",
    blurb: "Maestro / VSX diagnostics.",
    suggestedQuestions: ["Are all members synchronized?", "Is ClusterXL healthy?"],
  },
  {
    id: "fortigate",
    label: "FortiGate",
    shortLabel: "FortiGate",
    vendor: "fortinet",
    status: "planned",
    maturity: "low",
    icon: "Shield",
    blurb: "FortiGate diagnostic bundles.",
    suggestedQuestions: [
      "Is HA healthy?",
      "Are VPN tunnels down?",
      "Are there conserve mode or memory issues?",
      "Are interfaces down?",
      "Are licenses/subscriptions expired?",
    ],
  },
  {
    id: "fortimanager",
    label: "FortiManager",
    shortLabel: "FortiManager",
    vendor: "fortinet",
    status: "planned",
    maturity: "low",
    icon: "Network",
    blurb: "FortiManager diagnostics.",
    suggestedQuestions: ["Are managed devices in sync?", "Are there install failures?"],
  },
  {
    id: "fortianalyzer",
    label: "FortiAnalyzer",
    shortLabel: "FortiAnalyzer",
    vendor: "fortinet",
    status: "planned",
    maturity: "low",
    icon: "Database",
    blurb: "FortiAnalyzer diagnostics.",
    suggestedQuestions: ["Are log sources healthy?", "Is disk usage a concern?"],
  },
];

export const PRODUCT_MAP: Record<string, ProductDef> = Object.fromEntries(
  PRODUCTS.map((p) => [p.id, p])
);

export function productsForVendor(vendor: VendorId): ProductDef[] {
  return PRODUCTS.filter((p) => p.vendor === vendor);
}

export function vendorLabel(id?: string | null): string {
  if (!id) return "Unknown";
  return (VENDORS as Record<string, VendorDef>)[id]?.label ?? id;
}

export function productLabel(id?: string | null): string {
  if (!id) return "Unknown";
  return PRODUCT_MAP[id]?.shortLabel ?? id;
}

// Diagnostic categories with icons, spanning all vendors/products.
export interface CategoryDef {
  id: string;
  label: string;
  icon: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: "System Health", label: "System Health", icon: "Activity" },
  { id: "High Availability", label: "High Availability", icon: "Network" },
  { id: "Interfaces", label: "Interfaces", icon: "Cable" },
  { id: "Routing", label: "Routing", icon: "Route" },
  { id: "VPN", label: "VPN", icon: "Lock" },
  { id: "Panorama", label: "Panorama", icon: "Network" },
  { id: "Cortex Agent", label: "Cortex Agent", icon: "Bot" },
  { id: "Cortex Broker VM", label: "Cortex Broker VM", icon: "Server" },
  { id: "XSIAM Ingestion", label: "XSIAM Ingestion", icon: "Database" },
  { id: "Check Point Policy", label: "Check Point Policy", icon: "Shield" },
  { id: "FortiGate System", label: "FortiGate System", icon: "Server" },
  { id: "Commit & Config", label: "Commit & Config", icon: "FileText" },
  { id: "Licensing & Content", label: "Licensing & Content", icon: "FileText" },
  { id: "Logs", label: "Logs", icon: "Terminal" },
];

export const CATEGORY_ICONS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.icon])
);

export interface ConfidenceInfo {
  level: Maturity;
  label: string;
  score: number; // 0-100
}

export function confidenceLabel(level: Maturity): string {
  return level === "high" ? "High" : level === "medium" ? "Medium" : "Low";
}
