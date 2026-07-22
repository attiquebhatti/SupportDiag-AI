// Entity matching across two configurations.
//
// Matching is deliberately not scope-strict: migration tools legitimately move
// objects between shared and vsys/device-group scopes. A scope move is reported
// as a difference on the matched pair, never as "missing plus extra", which
// would double-count and hide the real relationship.

import type { NormalizedEntity } from "../types";
import type { MatchPair } from "./types";

function keyByName(e: NormalizedEntity): string {
  return `${e.objectType}|${e.normalizedName}`;
}

/**
 * Pair entities from `a` with entities from `b`.
 *
 * Pass 1 matches on normalized name, which absorbs separator/case rewrites.
 * Pass 2 matches whatever is left on semantic checksum, which catches objects
 * that were renamed outright but kept their value.
 */
export function matchEntities(
  a: NormalizedEntity[],
  b: NormalizedEntity[]
): MatchPair[] {
  const pairs: MatchPair[] = [];
  const bByName = new Map<string, NormalizedEntity[]>();
  for (const e of b) {
    const k = keyByName(e);
    const list = bByName.get(k);
    if (list) list.push(e);
    else bByName.set(k, [e]);
  }

  const usedB = new Set<NormalizedEntity>();
  const unmatchedA: NormalizedEntity[] = [];

  // Pass 1 — by normalized name.
  for (const ea of a) {
    const candidates = bByName.get(keyByName(ea));
    const hit = candidates?.find((c) => !usedB.has(c));
    if (hit) {
      usedB.add(hit);
      pairs.push({ a: ea, b: hit, renamed: false });
    } else {
      unmatchedA.push(ea);
    }
  }

  // Pass 2 — by value, for renamed entities.
  const leftoverB = b.filter((e) => !usedB.has(e));
  const bByChecksum = new Map<string, NormalizedEntity[]>();
  for (const e of leftoverB) {
    const k = `${e.objectType}|${e.checksum}`;
    const list = bByChecksum.get(k);
    if (list) list.push(e);
    else bByChecksum.set(k, [e]);
  }

  for (const ea of unmatchedA) {
    const candidates = bByChecksum.get(`${ea.objectType}|${ea.checksum}`);
    const hit = candidates?.find((c) => !usedB.has(c));
    if (hit) {
      usedB.add(hit);
      pairs.push({ a: ea, b: hit, renamed: true });
    } else {
      pairs.push({ a: ea, b: undefined, renamed: false });
    }
  }

  // Anything in b never claimed is extra.
  for (const eb of b) {
    if (!usedB.has(eb)) pairs.push({ a: undefined, b: eb, renamed: false });
  }

  return pairs;
}

/** Filter a config's entities to a single type. */
export function ofType(
  entities: NormalizedEntity[],
  objectType: string
): NormalizedEntity[] {
  return entities.filter((e) => e.objectType === objectType);
}
