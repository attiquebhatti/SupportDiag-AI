// Streaming PAN-OS / Panorama XML configuration parser.
//
// Support and migration configs are routinely hundreds of megabytes, so this
// never builds a DOM for the whole document. It walks the file with a SAX
// parser and materializes only one <entry> subtree at a time — the memory
// ceiling is a single rule, not the configuration.
//
// Handles both layouts:
//   standalone  /config/devices/entry/vsys/entry/rulebase/{security,nat,...}
//   Panorama    /config/devices/entry/device-group/entry/{pre,post}-rulebase/...
//               plus /config/shared/{pre,post}-rulebase and device-group nesting.

import { createHash } from "crypto";
import { SaxesParser } from "saxes";
import {
  type AddressEntity,
  type AddressGroupEntity,
  type AddressKind,
  type DecryptionRuleEntity,
  type GenericEntity,
  type NatRuleEntity,
  type NormalizedConfig,
  type NormalizedEntity,
  type NormalizedObjectType,
  type NormalizedScope,
  type ProfileSetting,
  type RulebasePlacement,
  type SecurityRuleEntity,
  type ServiceEntity,
  type ServiceGroupEntity,
  type SourceTranslation,
  normalizeName,
} from "../types";

// --- Minimal captured subtree ---------------------------------------------

interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  text: string;
}

function child(node: XNode, name: string): XNode | undefined {
  return node.children.find((c) => c.name === name);
}

function childText(node: XNode, name: string): string | undefined {
  const c = child(node, name);
  const t = c?.text.trim();
  return t ? t : undefined;
}

/**
 * Read a PAN-OS list field. Most are <field><member>a</member></field>, but a
 * few (notably NAT <service>) are scalars. Both shapes are accepted.
 */
function members(node: XNode, name: string): string[] {
  const c = child(node, name);
  if (!c) return [];
  const mem = c.children.filter((x) => x.name === "member").map((x) => x.text.trim());
  if (mem.length) return mem.filter(Boolean);
  const t = c.text.trim();
  return t ? [t] : [];
}

function yesNo(node: XNode, name: string, fallback = false): boolean {
  const t = childText(node, name)?.toLowerCase();
  if (t === undefined) return fallback;
  return t === "yes" || t === "true";
}

// --- Container routing -----------------------------------------------------

/** Object containers mapped to the normalized type they produce. */
const OBJECT_CONTAINERS: Record<string, NormalizedObjectType> = {
  address: "address",
  "address-group": "address-group",
  service: "service",
  "service-group": "service-group",
  tag: "tag",
  application: "application",
  "application-group": "application-group",
  "application-filter": "application-filter",
  schedule: "schedule",
  zone: "zone",
  "external-list": "external-dynamic-list",
  region: "url-category",
};

/** Rulebase leaf names mapped to the normalized policy type. */
const RULEBASE_TYPES: Record<string, NormalizedObjectType> = {
  security: "security-rule",
  nat: "nat-rule",
  decryption: "decryption-rule",
  authentication: "authentication-rule",
  "pbf": "pbf-rule",
  qos: "qos-rule",
  "dos": "dos-rule",
  "tunnel-inspect": "tunnel-inspection-rule",
  sdwan: "sdwan-rule",
  "application-override": "application-override-rule",
};

interface Container {
  objectType: NormalizedObjectType;
  scopeId: string;
  placement: RulebasePlacement;
}

/**
 * Decide what the <entry> elements directly inside `path` represent, given the
 * scope container we are currently inside.
 */
function routeContainer(path: string[], scopeId: string): Container | null {
  const last = path[path.length - 1];
  if (!last) return null;

  // .../{pre-rulebase|post-rulebase|rulebase}/<type>/rules
  if (last === "rules" && path.length >= 3) {
    const typeName = path[path.length - 2];
    const base = path[path.length - 3];
    const objectType = RULEBASE_TYPES[typeName];
    if (!objectType) return null;
    const placement: RulebasePlacement =
      base === "pre-rulebase" ? "pre" : base === "post-rulebase" ? "post" : "local";
    return { objectType, scopeId, placement };
  }

  // Object containers, but only when they sit directly under a scope root
  // (avoids misreading <service> inside a NAT rule as a service object).
  const objectType = OBJECT_CONTAINERS[last];
  if (objectType && isScopeRoot(path)) {
    return { objectType, scopeId, placement: "none" };
  }
  return null;
}

/** True when `path` ends at a scope root: shared, a vsys, or a device group. */
function isScopeRoot(path: string[]): boolean {
  const p = path.slice(0, -1);
  const tail = p[p.length - 1];
  const prev = p[p.length - 2];
  if (tail === "shared") return true;
  // devices/entry/vsys/entry  |  devices/entry/device-group/entry
  if (tail === "entry" && (prev === "vsys" || prev === "device-group" || prev === "template")) {
    return true;
  }
  return false;
}

// --- Parser ----------------------------------------------------------------

export interface ParseOptions {
  /** Recorded on every entity so findings can cite where a value came from. */
  sourceLabel?: string;
  vendor?: string;
}

class PanosNormalizer {
  private readonly cfg: NormalizedConfig;
  private readonly opts: ParseOptions;
  /** Element-name stack, excluding the root <config>. */
  private path: string[] = [];
  /** Named scope containers currently open, innermost last. */
  private scopeStack: { element: string; name: string }[] = [];
  /** Subtree capture state. */
  private capture: { root: XNode; stack: XNode[]; container: Container } | null = null;
  /** Next ordinal per rulebase key. */
  private orders = new Map<string, number>();
  private seenScopes = new Set<string>();
  /** Buffers <parent-dg> text, which establishes device-group inheritance. */
  private parentDgBuffer: string | null = null;

  constructor(opts: ParseOptions) {
    this.opts = opts;
    this.cfg = {
      format: "panos-xml",
      managementType: "unknown",
      scopes: [],
      entities: [],
      stats: {},
      warnings: [],
    };
  }

  get config(): NormalizedConfig {
    return this.cfg;
  }

  onOpen(name: string, attrs: Record<string, string>) {
    // Inside a captured subtree: keep building it.
    if (this.capture) {
      const node: XNode = { name, attrs, children: [], text: "" };
      this.capture.stack[this.capture.stack.length - 1].children.push(node);
      this.capture.stack.push(node);
      return;
    }

    if (name === "config") {
      if (attrs.version) this.cfg.version = attrs.version;
      return;
    }

    // Track named scope containers (vsys / device-group / template entries).
    const parent = this.path[this.path.length - 1];
    if (name === "entry" && attrs.name && isScopeContainer(parent)) {
      this.scopeStack.push({ element: parent, name: attrs.name });
      this.registerScope(parent, attrs.name);
      this.path.push(name);
      return;
    }

    // Does an <entry> here represent a configuration object we care about?
    if (name === "entry") {
      const container = routeContainer(this.path, this.currentScopeId());
      if (container) {
        const root: XNode = { name, attrs, children: [], text: "" };
        this.capture = { root, stack: [root], container };
        this.path.push(name);
        return;
      }
    }

    // <parent-dg> sits directly on a device-group entry and is the only source
    // of device-group inheritance, so it is read inline rather than captured.
    if (name === "parent-dg" && this.currentScopeId().startsWith("dg:")) {
      this.parentDgBuffer = "";
    }

    if (name === "shared") this.registerScope("shared", "shared");
    if (name === "device-group" || name === "template-stack") {
      this.cfg.managementType = "panorama";
    }
    this.path.push(name);
  }

  onText(text: string) {
    if (this.parentDgBuffer !== null) {
      this.parentDgBuffer += text;
      return;
    }
    if (!this.capture) return;
    const top = this.capture.stack[this.capture.stack.length - 1];
    top.text += text;
  }

  onClose(name: string) {
    if (this.capture) {
      // Closing the captured entry itself?
      if (this.capture.stack.length === 1) {
        this.emit(this.capture.root, this.capture.container);
        this.capture = null;
        this.path.pop();
        return;
      }
      this.capture.stack.pop();
      return;
    }

    if (this.parentDgBuffer !== null && name === "parent-dg") {
      const parent = this.parentDgBuffer.trim();
      this.parentDgBuffer = null;
      if (parent) {
        const scope = this.cfg.scopes.find((s) => s.id === this.currentScopeId());
        if (scope) scope.parentId = `dg:${parent}`;
      }
      this.path.pop();
      return;
    }

    if (name === "config") return;
    const popped = this.path.pop();
    if (popped === "entry") {
      const top = this.scopeStack[this.scopeStack.length - 1];
      const parent = this.path[this.path.length - 1];
      if (top && top.element === parent) this.scopeStack.pop();
    }
  }

  // --- scope helpers -------------------------------------------------------

  private currentScopeId(): string {
    const top = this.scopeStack[this.scopeStack.length - 1];
    if (!top) return "shared";
    const prefix =
      top.element === "vsys" ? "vsys" : top.element === "device-group" ? "dg" : "template";
    return `${prefix}:${top.name}`;
  }

  private registerScope(element: string, name: string) {
    const id =
      element === "shared"
        ? "shared"
        : `${element === "vsys" ? "vsys" : element === "device-group" ? "dg" : "template"}:${name}`;
    if (this.seenScopes.has(id)) return;
    this.seenScopes.add(id);
    const kind: NormalizedScope["kind"] =
      element === "shared"
        ? "shared"
        : element === "vsys"
          ? "vsys"
          : element === "device-group"
            ? "device-group"
            : "template";
    this.cfg.scopes.push({ id, kind, name });
    if (element === "vsys" && this.cfg.managementType === "unknown") {
      this.cfg.managementType = "standalone";
    }
  }

  // --- emission ------------------------------------------------------------

  private nextOrder(key: string): number {
    const n = (this.orders.get(key) ?? 0) + 1;
    this.orders.set(key, n);
    return n;
  }

  private emit(node: XNode, c: Container) {
    const name = node.attrs.name ?? "";
    if (!name) {
      this.cfg.warnings.push(`Unnamed ${c.objectType} entry in ${c.scopeId} was skipped.`);
      return;
    }
    const entity = this.build(node, c, name);
    if (!entity) return;
    this.cfg.entities.push(entity);
    this.cfg.stats[c.objectType] = (this.cfg.stats[c.objectType] ?? 0) + 1;
  }

  private base(node: XNode, c: Container, name: string) {
    return {
      id: `${c.scopeId}|${c.objectType}|${c.placement}|${normalizeName(name)}`,
      objectType: c.objectType,
      originalId: node.attrs.uuid,
      name,
      normalizedName: normalizeName(name),
      vendor: this.opts.vendor ?? "paloalto",
      scope: c.scopeId,
      enabled: !yesNo(node, "disabled", false),
      description: childText(node, "description"),
      tags: members(node, "tag"),
      sourceReference: this.opts.sourceLabel,
      confidence: 100,
      checksum: "",
    };
  }

  private build(node: XNode, c: Container, name: string): NormalizedEntity | null {
    const b = this.base(node, c, name);

    switch (c.objectType) {
      case "address": {
        const kinds: AddressKind[] = ["ip-netmask", "ip-range", "ip-wildcard", "fqdn"];
        const found = kinds.find((k) => childText(node, k) !== undefined);
        const e: AddressEntity = {
          ...b,
          objectType: "address",
          addressKind: found ?? "unknown",
          value: found ? (childText(node, found) ?? "") : "",
        };
        return withChecksum(e, [e.addressKind, e.value]);
      }

      case "address-group": {
        const dynamicFilter = child(node, "dynamic")
          ? childText(child(node, "dynamic")!, "filter")
          : undefined;
        const e: AddressGroupEntity = {
          ...b,
          objectType: dynamicFilter ? "dynamic-address-group" : "address-group",
          members: members(node, "static"),
          dynamicFilter,
        };
        return withChecksum(e, [...e.members, e.dynamicFilter ?? ""]);
      }

      case "service": {
        const proto = child(node, "protocol");
        const tcp = proto ? child(proto, "tcp") : undefined;
        const udp = proto ? child(proto, "udp") : undefined;
        const sctp = proto ? child(proto, "sctp") : undefined;
        const active = tcp ?? udp ?? sctp;
        const e: ServiceEntity = {
          ...b,
          objectType: "service",
          protocol: tcp ? "tcp" : udp ? "udp" : sctp ? "sctp" : "other",
          destinationPorts: splitPorts(active ? childText(active, "port") : undefined),
          sourcePorts: splitPorts(active ? childText(active, "source-port") : undefined),
        };
        return withChecksum(e, [e.protocol, ...e.destinationPorts, ...e.sourcePorts]);
      }

      case "service-group": {
        const e: ServiceGroupEntity = {
          ...b,
          objectType: "service-group",
          members: members(node, "members"),
        };
        return withChecksum(e, e.members);
      }

      case "security-rule": {
        const e: SecurityRuleEntity = {
          ...b,
          objectType: "security-rule",
          order: this.nextOrder(`${c.scopeId}|security|${c.placement}`),
          placement: c.placement,
          ruleType: childText(node, "rule-type") ?? "universal",
          fromZones: members(node, "from"),
          toZones: members(node, "to"),
          sources: members(node, "source"),
          destinations: members(node, "destination"),
          sourceUsers: members(node, "source-user"),
          applications: members(node, "application"),
          services: members(node, "service"),
          urlCategories: members(node, "category"),
          hipProfiles: members(node, "hip-profiles"),
          schedule: childText(node, "schedule"),
          action: childText(node, "action") ?? "allow",
          logStart: yesNo(node, "log-start", false),
          logEnd: yesNo(node, "log-end", true),
          logSetting: childText(node, "log-setting"),
          profileSetting: readProfileSetting(node),
          negateSource: yesNo(node, "negate-source", false),
          negateDestination: yesNo(node, "negate-destination", false),
          targets: readTargets(node),
        };
        return withChecksum(e, [
          ...e.fromZones, ...e.toZones, ...e.sources, ...e.destinations,
          ...e.sourceUsers, ...e.applications, ...e.services, e.action,
          String(e.logEnd), e.profileSetting.group ?? "", String(e.enabled),
        ]);
      }

      case "nat-rule": {
        const st = readSourceTranslation(node);
        const dt = child(node, "destination-translation");
        const e: NatRuleEntity = {
          ...b,
          objectType: "nat-rule",
          order: this.nextOrder(`${c.scopeId}|nat|${c.placement}`),
          placement: c.placement,
          fromZones: members(node, "from"),
          toZones: members(node, "to"),
          destinationInterface: childText(node, "to-interface"),
          sources: members(node, "source"),
          destinations: members(node, "destination"),
          services: members(node, "service"),
          sourceTranslation: st,
          destinationTranslation: dt
            ? {
                translatedAddress: childText(dt, "translated-address"),
                translatedPort: numeric(childText(dt, "translated-port")),
                dnsRewrite: child(dt, "dns-rewrite")
                  ? childText(child(dt, "dns-rewrite")!, "direction")
                  : undefined,
              }
            : undefined,
          isNoNat: st.kind === "none" && !dt,
          targets: readTargets(node),
        };
        return withChecksum(e, [
          ...e.fromZones, ...e.toZones, ...e.sources, ...e.destinations, ...e.services,
          e.sourceTranslation.kind, ...e.sourceTranslation.translatedAddresses,
          e.destinationTranslation?.translatedAddress ?? "",
          String(e.destinationTranslation?.translatedPort ?? ""),
        ]);
      }

      case "decryption-rule": {
        const type = child(node, "type");
        const e: DecryptionRuleEntity = {
          ...b,
          objectType: "decryption-rule",
          order: this.nextOrder(`${c.scopeId}|decryption|${c.placement}`),
          placement: c.placement,
          fromZones: members(node, "from"),
          toZones: members(node, "to"),
          sources: members(node, "source"),
          destinations: members(node, "destination"),
          sourceUsers: members(node, "source-user"),
          services: members(node, "service"),
          urlCategories: members(node, "category"),
          action: childText(node, "action") ?? "no-decrypt",
          decryptionType: type?.children[0]?.name,
          profile: childText(node, "profile"),
          certificate: type?.children[0]
            ? childText(type.children[0], "certificate")
            : undefined,
          negateSource: yesNo(node, "negate-source", false),
          negateDestination: yesNo(node, "negate-destination", false),
          targets: readTargets(node),
        };
        return withChecksum(e, [
          ...e.fromZones, ...e.toZones, ...e.sources, ...e.destinations,
          ...e.urlCategories, e.action, e.decryptionType ?? "", e.profile ?? "",
        ]);
      }

      default: {
        // Recorded for completeness and dependency resolution; not deep-compared
        // in Phase 1.
        const e: GenericEntity = {
          ...b,
          members: members(node, "members").concat(members(node, "static")),
          attributes: flatten(node),
        };
        return withChecksum(e, [JSON.stringify(e.attributes)]);
      }
    }
  }
}

function isScopeContainer(el?: string): boolean {
  return el === "vsys" || el === "device-group" || el === "template" || el === "template-stack";
}

function numeric(v?: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** "80,443,8000-8080" -> ["80","443","8000-8080"], sorted for stable compare. */
function splitPorts(v?: string): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
}

function readTargets(node: XNode): string[] {
  const t = child(node, "target");
  if (!t) return [];
  const devices = child(t, "devices");
  if (!devices) return [];
  return devices.children
    .filter((c) => c.name === "entry" && c.attrs.name)
    .map((c) => c.attrs.name);
}

function readProfileSetting(node: XNode): ProfileSetting {
  const ps = child(node, "profile-setting");
  if (!ps || ps.children.length === 0) return { none: true };
  const group = child(ps, "group");
  if (group) {
    const g = group.children.filter((c) => c.name === "member").map((c) => c.text.trim());
    if (g.length) return { group: g[0], none: false };
  }
  const profiles = child(ps, "profiles");
  if (profiles) {
    const map: Record<string, string> = {};
    for (const p of profiles.children) {
      const m = p.children.find((c) => c.name === "member");
      if (m) map[p.name] = m.text.trim();
    }
    if (Object.keys(map).length) return { profiles: map, none: false };
  }
  return { none: true };
}

function readSourceTranslation(node: XNode): SourceTranslation {
  const st = child(node, "source-translation");
  if (!st) return { kind: "none", translatedAddresses: [], bidirectional: false };

  const dipp = child(st, "dynamic-ip-and-port");
  if (dipp) {
    const ifaceAddr = child(dipp, "interface-address");
    return {
      kind: "dynamic-ip-and-port",
      translatedAddresses: members(dipp, "translated-address"),
      interfaceName: ifaceAddr ? childText(ifaceAddr, "interface") : undefined,
      bidirectional: false,
    };
  }
  const dip = child(st, "dynamic-ip");
  if (dip) {
    return {
      kind: "dynamic-ip",
      translatedAddresses: members(dip, "translated-address"),
      bidirectional: false,
    };
  }
  const stat = child(st, "static-ip");
  if (stat) {
    const addr = childText(stat, "translated-address");
    return {
      kind: "static-ip",
      translatedAddresses: addr ? [addr] : [],
      bidirectional: yesNo(stat, "bi-directional", false),
    };
  }
  return { kind: "none", translatedAddresses: [], bidirectional: false };
}

/** Shallow map of a node's leaf values, for entity types without deep support. */
function flatten(node: XNode): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of node.children) {
    if (c.name === "description" || c.name === "tag") continue;
    const mem = c.children.filter((x) => x.name === "member").map((x) => x.text.trim());
    if (mem.length) out[c.name] = mem;
    else if (c.children.length === 0) out[c.name] = c.text.trim();
  }
  return out;
}

function withChecksum<T extends { checksum: string }>(entity: T, parts: string[]): T {
  entity.checksum = createHash("sha1").update(parts.join(" ")).digest("hex").slice(0, 16);
  return entity;
}

// --- Public API ------------------------------------------------------------

/** Parse PAN-OS/Panorama XML from an async chunk source (file stream). */
export async function parsePanosXmlStream(
  chunks: AsyncIterable<string | Buffer>,
  opts: ParseOptions = {}
): Promise<NormalizedConfig> {
  const norm = new PanosNormalizer(opts);
  const parser = new SaxesParser({ fragment: false });

  parser.on("opentag", (tag) => {
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(tag.attributes)) attrs[k] = String(v);
    norm.onOpen(tag.name, attrs);
  });
  parser.on("text", (t) => norm.onText(t));
  parser.on("cdata", (t) => norm.onText(t));
  parser.on("closetag", (tag) => norm.onClose(tag.name));
  parser.on("error", (err) => {
    norm.config.warnings.push(`XML parse error: ${err.message}`);
  });

  for await (const chunk of chunks) {
    parser.write(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }
  parser.close();

  if (norm.config.managementType === "unknown") {
    norm.config.managementType = norm.config.scopes.some((s) => s.kind === "device-group")
      ? "panorama"
      : "standalone";
  }
  return norm.config;
}

/** Convenience wrapper for in-memory XML (tests and small configs). */
export async function parsePanosXml(
  xml: string,
  opts: ParseOptions = {}
): Promise<NormalizedConfig> {
  async function* one() {
    yield xml;
  }
  return parsePanosXmlStream(one(), opts);
}
