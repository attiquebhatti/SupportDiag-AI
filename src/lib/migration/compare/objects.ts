// Object comparison and dependency validation (§5).

import type { RiskClassification } from "@prisma/client";
import {
  type AddressEntity,
  type AddressGroupEntity,
  type NormalizedConfig,
  type NormalizedEntity,
  type ServiceEntity,
  type ServiceGroupEntity,
  normalizeMembers,
  normalizeName,
} from "../types";
import type { FieldDiff, FindingDraft } from "./types";
import type { PolicyDiffResult } from "./policies";

/**
 * Canonical form of an address value so that equivalent notations compare
 * equal. `10.1.1.5` and `10.1.1.5/32` describe the same host.
 */
function canonicalAddress(kind: string, value: string): string {
  const v = value.trim().toLowerCase();
  if (kind === "ip-netmask") {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) return `${v}/32`;
    return v;
  }
  if (kind === "ip-range") {
    const [lo, hi] = v.split("-").map((s) => s.trim());
    // A range covering one address is the same as that host.
    if (lo && lo === hi) return `${lo}/32`;
    return v;
  }
  return v;
}

/** `443` and `443-443` describe the same port. */
function canonicalPorts(ports: string[]): string[] {
  return normalizeMembers(
    ports.map((p) => {
      const [lo, hi] = p.split("-").map((s) => s.trim());
      return hi && lo === hi ? lo : p.trim();
    })
  );
}

export function compareObjects(
  a: NormalizedEntity,
  b: NormalizedEntity
): PolicyDiffResult {
  const diffs: FieldDiff[] = [];
  let risk: RiskClassification = "NO_MATERIAL_CHANGE";

  if (a.objectType !== b.objectType) {
    diffs.push({
      field: "objectType",
      source: a.objectType,
      migrated: b.objectType,
      verdict: "changed",
      note: "object type changed during migration",
    });
    risk = "FUNCTIONAL_DIFFERENCE";
  }

  if (a.objectType === "address" && b.objectType === "address") {
    // Generic entity variants share the broad objectType union, so the literal
    // check above cannot narrow on its own.
    const aa = a as AddressEntity;
    const bb = b as AddressEntity;
    const av = canonicalAddress(aa.addressKind, aa.value);
    const bv = canonicalAddress(bb.addressKind, bb.value);
    if (av !== bv) {
      diffs.push({
        field: "value",
        source: aa.value,
        migrated: bb.value,
        verdict: "changed",
        note: "address value differs",
      });
      risk = "FUNCTIONAL_DIFFERENCE";
    } else if (aa.addressKind !== bb.addressKind) {
      diffs.push({
        field: "addressKind",
        source: aa.addressKind,
        migrated: bb.addressKind,
        verdict: "equivalent",
        note: "different notation, same address",
      });
    }
  }

  if (a.objectType === "service" && b.objectType === "service") {
    const sa = a as ServiceEntity;
    const sb = b as ServiceEntity;
    if (sa.protocol !== sb.protocol) {
      diffs.push({
        field: "protocol",
        source: sa.protocol,
        migrated: sb.protocol,
        verdict: "changed",
        note: "service protocol changed",
      });
      risk = "CONNECTIVITY_RISK";
    }
    const pa = canonicalPorts(sa.destinationPorts);
    const pb = canonicalPorts(sb.destinationPorts);
    if (pa.join(",") !== pb.join(",")) {
      diffs.push({
        field: "destinationPorts",
        source: sa.destinationPorts,
        migrated: sb.destinationPorts,
        verdict: pb.length > pa.length ? "broadened" : "changed",
        note: "destination ports differ",
      });
      risk = "CONNECTIVITY_RISK";
    }
  }

  const aMembers = memberList(a);
  const bMembers = memberList(b);
  if (aMembers || bMembers) {
    const ma = normalizeMembers(aMembers ?? []);
    const mb = normalizeMembers(bMembers ?? []);
    if (ma.join(",") !== mb.join(",")) {
      const grew = mb.length > ma.length;
      diffs.push({
        field: "members",
        source: aMembers,
        migrated: bMembers,
        verdict: mb.length === 0 ? "lost" : grew ? "broadened" : "narrowed",
        note: "group membership differs",
      });
      risk = mb.length === 0 ? "CONNECTIVITY_RISK" : "FUNCTIONAL_DIFFERENCE";
    }
  }

  if ((a.description ?? "") !== (b.description ?? "")) {
    diffs.push({
      field: "description",
      source: a.description,
      migrated: b.description,
      verdict: b.description ? "changed" : "lost",
    });
  }
  if (normalizeMembers(a.tags).join(",") !== normalizeMembers(b.tags).join(",")) {
    diffs.push({ field: "tags", source: a.tags, migrated: b.tags, verdict: "changed" });
  }
  if (a.scope !== b.scope) {
    diffs.push({
      field: "scope",
      source: a.scope,
      migrated: b.scope,
      verdict: "changed",
      note: "object moved to a different scope",
    });
  }

  return { diffs, risk };
}

function memberList(e: NormalizedEntity): string[] | null {
  if ("members" in e && Array.isArray((e as { members?: string[] }).members)) {
    return (e as AddressGroupEntity | ServiceGroupEntity).members;
  }
  return null;
}

// --- Dependency validation -------------------------------------------------

const BUILTIN_SERVICES = new Set([
  "any",
  "application-default",
  "service-http",
  "service-https",
]);

const IP_LITERAL =
  /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^(\d{1,3}\.){3}\d{1,3}\s*-\s*(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+(\/\d{1,3})?$/i;

interface ObjectIndex {
  addresses: Set<string>;
  addressGroups: Set<string>;
  services: Set<string>;
  serviceGroups: Set<string>;
  edls: Set<string>;
  groupMembers: Map<string, string[]>;
}

function buildIndex(cfg: NormalizedConfig): ObjectIndex {
  const idx: ObjectIndex = {
    addresses: new Set(),
    addressGroups: new Set(),
    services: new Set(),
    serviceGroups: new Set(),
    edls: new Set(),
    groupMembers: new Map(),
  };
  for (const e of cfg.entities) {
    const n = e.normalizedName;
    switch (e.objectType) {
      case "address":
        idx.addresses.add(n);
        break;
      case "address-group":
      case "dynamic-address-group":
        idx.addressGroups.add(n);
        idx.groupMembers.set(n, (e as AddressGroupEntity).members ?? []);
        break;
      case "service":
        idx.services.add(n);
        break;
      case "service-group":
        idx.serviceGroups.add(n);
        idx.groupMembers.set(n, (e as ServiceGroupEntity).members ?? []);
        break;
      case "external-dynamic-list":
        idx.edls.add(n);
        break;
    }
  }
  return idx;
}

function addressResolves(name: string, idx: ObjectIndex): boolean {
  const n = normalizeName(name);
  if (n === "any" || IP_LITERAL.test(name.trim())) return true;
  return idx.addresses.has(n) || idx.addressGroups.has(n) || idx.edls.has(n);
}

function serviceResolves(name: string, idx: ObjectIndex): boolean {
  const raw = name.trim().toLowerCase();
  if (BUILTIN_SERVICES.has(raw)) return true;
  const n = normalizeName(name);
  return idx.services.has(n) || idx.serviceGroups.has(n);
}

/**
 * Validate references, group integrity, and object hygiene within one config.
 * `label` identifies which configuration is being checked so findings can say
 * whether the problem is in the migration output or on the deployed device.
 */
export function validateDependencies(
  cfg: NormalizedConfig,
  label: string
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const idx = buildIndex(cfg);
  const referenced = new Set<string>();

  const noteRef = (v: string) => referenced.add(normalizeName(v));

  for (const e of cfg.entities) {
    // Rules reference address and service objects.
    if (e.objectType === "security-rule" || e.objectType === "nat-rule" || e.objectType === "decryption-rule") {
      const r = e as unknown as {
        sources: string[];
        destinations: string[];
        services?: string[];
      };
      for (const v of [...(r.sources ?? []), ...(r.destinations ?? [])]) {
        noteRef(v);
        if (!addressResolves(v, idx)) {
          findings.push({
            category: "MIGRATION_FAILURE",
            severity: "HIGH",
            findingType: "dependency.unresolved-address",
            title: `Unresolved address reference "${v}"`,
            description: `Rule "${e.name}" (${e.objectType}) in ${label} references address object "${v}", which is not defined anywhere in that configuration.`,
            entityType: e.objectType,
            entityName: e.name,
            impact:
              "The rule cannot be committed, or will not match the intended traffic if the reference is silently dropped.",
            recommendation: `Create address object "${v}" in an accessible scope, or correct the rule to reference an existing object.`,
          });
        }
      }
      for (const v of r.services ?? []) {
        noteRef(v);
        if (!serviceResolves(v, idx)) {
          findings.push({
            category: "MIGRATION_FAILURE",
            severity: "HIGH",
            findingType: "dependency.unresolved-service",
            title: `Unresolved service reference "${v}"`,
            description: `Rule "${e.name}" (${e.objectType}) in ${label} references service "${v}", which is not defined in that configuration.`,
            entityType: e.objectType,
            entityName: e.name,
            impact: "The rule will fail validation or will not match the intended ports.",
            recommendation: `Define service "${v}" or point the rule at an existing service object.`,
          });
        }
      }
    }

    // Groups reference their members.
    const mem = memberList(e);
    if (mem) {
      for (const v of mem) noteRef(v);
      if (mem.length === 0 && e.objectType !== "dynamic-address-group") {
        findings.push({
          category: "MIGRATION_DIFFERENCE",
          severity: "MEDIUM",
          findingType: "dependency.empty-group",
          title: `Empty group "${e.name}"`,
          description: `Group "${e.name}" in ${label} has no members. Rules referencing it will not match any traffic.`,
          entityType: e.objectType,
          entityName: e.name,
          impact: "Any rule using this group silently matches nothing.",
          recommendation: "Populate the group or remove the rules that depend on it.",
        });
      }
      if (e.objectType === "address-group" || e.objectType === "service-group") {
        for (const v of mem) {
          const n = normalizeName(v);
          const known =
            e.objectType === "address-group"
              ? addressResolves(v, idx)
              : serviceResolves(v, idx);
          if (!known && !idx.groupMembers.has(n)) {
            findings.push({
              category: "MIGRATION_FAILURE",
              severity: "HIGH",
              findingType: "dependency.unresolved-group-member",
              title: `Group "${e.name}" references undefined member "${v}"`,
              description: `Member "${v}" of group "${e.name}" in ${label} does not resolve to a defined object.`,
              entityType: e.objectType,
              entityName: e.name,
              impact: "The group is incomplete, so dependent rules match less traffic than intended.",
              recommendation: `Define "${v}" or remove it from the group.`,
            });
          }
        }
      }
    }
  }

  findings.push(...detectCircularGroups(idx, label));
  findings.push(...detectDuplicates(cfg, label));

  // Objects defined but never referenced anywhere.
  for (const e of cfg.entities) {
    const isObject =
      e.objectType === "address" ||
      e.objectType === "service" ||
      e.objectType === "address-group" ||
      e.objectType === "service-group";
    if (!isObject) continue;
    if (!referenced.has(e.normalizedName)) {
      findings.push({
        category: "OPTIMIZATION_RECOMMENDATION",
        severity: "LOW",
        findingType: "hygiene.unused-object",
        title: `Unused object "${e.name}"`,
        description: `Object "${e.name}" exists in ${label} but is not referenced by any rule or group.`,
        entityType: e.objectType,
        entityName: e.name,
        impact: "No functional impact; adds configuration noise.",
        recommendation: "Remove if it is not required for a future change.",
      });
    }
  }

  return findings;
}

/** Depth-first search for cycles in group membership. */
function detectCircularGroups(idx: ObjectIndex, label: string): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 in-stack, 2 done
  const reported = new Set<string>();

  const visit = (name: string, trail: string[]) => {
    const s = state.get(name) ?? 0;
    if (s === 2) return;
    if (s === 1) {
      const cycle = [...trail.slice(trail.indexOf(name)), name].join(" -> ");
      if (!reported.has(cycle)) {
        reported.add(cycle);
        findings.push({
          category: "MIGRATION_FAILURE",
          severity: "CRITICAL",
          findingType: "dependency.circular-group",
          title: `Circular group dependency: ${cycle}`,
          description: `Group membership in ${label} forms a cycle (${cycle}), which PAN-OS will reject at commit.`,
          entityName: name,
          impact: "Commit fails, so none of the migrated configuration becomes active.",
          recommendation: "Break the cycle by removing one of the nested group references.",
        });
      }
      return;
    }
    state.set(name, 1);
    for (const m of idx.groupMembers.get(name) ?? []) {
      const n = normalizeName(m);
      if (idx.groupMembers.has(n)) visit(n, [...trail, name]);
    }
    state.set(name, 2);
  };

  for (const g of idx.groupMembers.keys()) visit(g, []);
  return findings;
}

/** Objects with identical values but different names. */
function detectDuplicates(cfg: NormalizedConfig, label: string): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const byValue = new Map<string, string[]>();
  for (const e of cfg.entities) {
    if (e.objectType !== "address" && e.objectType !== "service") continue;
    const key = `${e.objectType}|${e.checksum}`;
    const list = byValue.get(key);
    if (list) list.push(e.name);
    else byValue.set(key, [e.name]);
  }
  for (const [key, names] of byValue) {
    if (names.length < 2) continue;
    findings.push({
      category: "OPTIMIZATION_RECOMMENDATION",
      severity: "LOW",
      findingType: "hygiene.duplicate-object",
      title: `Duplicate objects: ${names.join(", ")}`,
      description: `${names.length} objects in ${label} share the same value (${key.split("|")[0]}). Migration tools often create duplicates when merging scopes.`,
      entityName: names[0],
      impact: "No functional impact; increases maintenance burden.",
      recommendation: "Consolidate to a single object and update references.",
    });
  }
  return findings;
}
