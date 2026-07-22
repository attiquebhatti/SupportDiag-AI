// Vendor-neutral normalized configuration model (Migration Assurance §4).
//
// Every configuration — source vendor, migration output, and deployed target —
// is transformed into this shape before any comparison happens. Comparison
// logic therefore never needs to know which vendor or format it came from.

/** Every configuration entity type the normalizer can emit. */
export type NormalizedObjectType =
  // Objects
  | "address"
  | "address-group"
  | "dynamic-address-group"
  | "service"
  | "service-group"
  | "application"
  | "application-group"
  | "application-filter"
  | "user"
  | "user-group"
  | "tag"
  | "schedule"
  | "external-dynamic-list"
  | "url-category"
  // Network
  | "zone"
  | "interface"
  | "vlan"
  | "virtual-router"
  | "route"
  | "management-profile"
  | "zone-protection-profile"
  // Profiles & crypto
  | "security-profile"
  | "security-profile-group"
  | "log-forwarding-profile"
  | "decryption-profile"
  | "certificate"
  | "hip-object"
  | "hip-profile"
  | "ike-gateway"
  | "ipsec-crypto-profile"
  | "ipsec-tunnel"
  | "globalprotect"
  | "user-id"
  // Policies
  | "security-rule"
  | "nat-rule"
  | "decryption-rule"
  | "authentication-rule"
  | "pbf-rule"
  | "qos-rule"
  | "dos-rule"
  | "tunnel-inspection-rule"
  | "sdwan-rule"
  | "application-override-rule";

/** Policy types that participate in ordered rulebases. */
export const POLICY_TYPES = [
  "security-rule",
  "nat-rule",
  "decryption-rule",
  "authentication-rule",
  "pbf-rule",
  "qos-rule",
  "dos-rule",
  "tunnel-inspection-rule",
  "sdwan-rule",
  "application-override-rule",
] as const satisfies readonly NormalizedObjectType[];

export function isPolicyType(t: string): boolean {
  return (POLICY_TYPES as readonly string[]).includes(t);
}

/**
 * Where a rule or object lives. Standalone PAN-OS uses shared/vsys; Panorama
 * adds device groups and templates; SCM adds folders and snippets.
 */
export type ScopeKind =
  | "shared"
  | "vsys"
  | "device-group"
  | "template"
  | "template-stack"
  | "folder"
  | "snippet"
  | "device";

export interface NormalizedScope {
  /** Stable key, e.g. "shared", "vsys:vsys1", "dg:Branch-DG". */
  id: string;
  kind: ScopeKind;
  name: string;
  /** Parent scope id — drives Panorama device-group inheritance. */
  parentId?: string;
}

/**
 * Rulebase placement. Panorama evaluates pre-rules, then local firewall rules,
 * then post-rules, so placement is part of a rule's identity, not a detail.
 */
export type RulebasePlacement = "pre" | "post" | "local" | "none";

/** Confidence that a normalized value faithfully represents the original. */
export type Confidence = number; // 0-100

/** Common envelope shared by every normalized entity. */
export interface NormalizedEntityBase {
  /** Stable internal id, deterministic within a snapshot. */
  id: string;
  objectType: NormalizedObjectType;
  /** Identifier in the originating config, when it has one (e.g. rule UUID). */
  originalId?: string;
  /** Name exactly as written in the source configuration. */
  name: string;
  /** Case/separator-folded name used for cross-configuration matching. */
  normalizedName: string;
  vendor?: string;
  scope: string;
  parentScope?: string;
  enabled: boolean;
  description?: string;
  tags: string[];
  /** Where this came from — file path, XPath, or line reference. */
  sourceReference?: string;
  /** Human-readable notes about how the value was transformed. */
  transformationNotes?: string[];
  /** Attributes present in the original that this model cannot represent. */
  unsupportedAttributes?: string[];
  confidence: Confidence;
  /** Content hash of the semantic value, used for fast equality checks. */
  checksum: string;
}

// --- Object payloads -------------------------------------------------------

export type AddressKind = "ip-netmask" | "ip-range" | "ip-wildcard" | "fqdn" | "unknown";

export interface AddressEntity extends NormalizedEntityBase {
  objectType: "address";
  addressKind: AddressKind;
  value: string;
}

export interface AddressGroupEntity extends NormalizedEntityBase {
  objectType: "address-group" | "dynamic-address-group";
  /** Static member names; empty for dynamic groups. */
  members: string[];
  /** Match expression for dynamic address groups. */
  dynamicFilter?: string;
}

export interface ServiceEntity extends NormalizedEntityBase {
  objectType: "service";
  protocol: "tcp" | "udp" | "sctp" | "other";
  /** Destination ports, normalized to sorted ranges e.g. "443", "8000-8080". */
  destinationPorts: string[];
  sourcePorts: string[];
  overrideTimeout?: number;
}

export interface ServiceGroupEntity extends NormalizedEntityBase {
  objectType: "service-group";
  members: string[];
}

/** Generic container for entity types Phase 1 records but does not deep-compare. */
export interface GenericEntity extends NormalizedEntityBase {
  members: string[];
  /** Raw normalized attributes, compared field-by-field when present. */
  attributes: Record<string, unknown>;
}

// --- Policy payloads -------------------------------------------------------

/** Profile attachment on a security rule — either a group or individual profiles. */
export interface ProfileSetting {
  /** Security profile group name, when the rule uses one. */
  group?: string;
  /** Individual profiles keyed by type (virus, spyware, vulnerability, ...). */
  profiles?: Record<string, string>;
  /** True when the rule has no threat inspection attached at all. */
  none: boolean;
}

export interface SecurityRuleEntity extends NormalizedEntityBase {
  objectType: "security-rule";
  order: number;
  placement: RulebasePlacement;
  ruleType: string; // universal | interzone | intrazone
  fromZones: string[];
  toZones: string[];
  sources: string[];
  destinations: string[];
  sourceUsers: string[];
  applications: string[];
  services: string[];
  urlCategories: string[];
  hipProfiles: string[];
  schedule?: string;
  action: string; // allow | deny | drop | reset-client | reset-server | reset-both
  logStart: boolean;
  logEnd: boolean;
  logSetting?: string;
  profileSetting: ProfileSetting;
  negateSource: boolean;
  negateDestination: boolean;
  /** Panorama target device serials, when the rule is device-scoped. */
  targets: string[];
}

export type SourceTranslationKind =
  | "dynamic-ip-and-port"
  | "dynamic-ip"
  | "static-ip"
  | "none";

export interface SourceTranslation {
  kind: SourceTranslationKind;
  /** Translated address objects, or the interface when using interface-address. */
  translatedAddresses: string[];
  /** Set when translation uses an interface rather than an address object. */
  interfaceName?: string;
  /** static-ip only: whether the reverse (bi-directional) rule is implied. */
  bidirectional: boolean;
}

export interface DestinationTranslation {
  translatedAddress?: string;
  translatedPort?: number;
  dnsRewrite?: string;
}

export interface NatRuleEntity extends NormalizedEntityBase {
  objectType: "nat-rule";
  order: number;
  placement: RulebasePlacement;
  fromZones: string[];
  toZones: string[];
  destinationInterface?: string;
  sources: string[];
  destinations: string[];
  services: string[];
  sourceTranslation: SourceTranslation;
  destinationTranslation?: DestinationTranslation;
  /** True when the rule intentionally performs no translation (no-NAT). */
  isNoNat: boolean;
  targets: string[];
}

export interface DecryptionRuleEntity extends NormalizedEntityBase {
  objectType: "decryption-rule";
  order: number;
  placement: RulebasePlacement;
  fromZones: string[];
  toZones: string[];
  sources: string[];
  destinations: string[];
  sourceUsers: string[];
  services: string[];
  urlCategories: string[];
  /** decrypt | no-decrypt | decrypt-and-forward */
  action: string;
  /** ssl-forward-proxy | ssl-inbound-inspection | ssh-proxy */
  decryptionType?: string;
  profile?: string;
  certificate?: string;
  negateSource: boolean;
  negateDestination: boolean;
  targets: string[];
}

/** Generic ordered policy for types Phase 1 records without deep semantics. */
export interface GenericPolicyEntity extends NormalizedEntityBase {
  order: number;
  placement: RulebasePlacement;
  attributes: Record<string, unknown>;
}

export type NormalizedEntity =
  | AddressEntity
  | AddressGroupEntity
  | ServiceEntity
  | ServiceGroupEntity
  | SecurityRuleEntity
  | NatRuleEntity
  | DecryptionRuleEntity
  | GenericPolicyEntity
  | GenericEntity;

/** A fully parsed configuration ready for comparison. */
export interface NormalizedConfig {
  /** Source format identifier, e.g. "panos-xml", "panorama-xml". */
  format: string;
  managementType: "standalone" | "panorama" | "scm" | "unknown";
  version?: string;
  scopes: NormalizedScope[];
  entities: NormalizedEntity[];
  /** Entity counts by objectType, for dashboards and quick sanity checks. */
  stats: Record<string, number>;
  /** Non-fatal parse issues worth surfacing to the analyst. */
  warnings: string[];
}

// --- Helpers ---------------------------------------------------------------

/**
 * Fold a name for cross-configuration matching. Migration tools routinely
 * rewrite separators and case (ERP-Servers -> ERP_Servers), which must not be
 * mistaken for a missing object.
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s._-]+/g, "-");
}

/** Order-insensitive, case-folded member list used for set comparison. */
export function normalizeMembers(members: string[]): string[] {
  return [...new Set(members.map((m) => m.trim().toLowerCase()))].sort();
}

/** True when a member list means "match anything". */
export function isAny(members: string[]): boolean {
  return members.length === 1 && members[0].trim().toLowerCase() === "any";
}

export function emptyConfig(format: string): NormalizedConfig {
  return {
    format,
    managementType: "unknown",
    scopes: [],
    entities: [],
    stats: {},
    warnings: [],
  };
}
