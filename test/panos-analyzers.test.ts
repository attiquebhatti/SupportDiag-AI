// Phase 1B unit tests — deep PAN-OS analyzers + correlation.
// Run with: npx tsx test/panos-analyzers.test.ts
import assert from "node:assert";
import type { ParserArtifact } from "../src/lib/parsers/types";
import { runDeepAnalysis } from "../src/lib/panos/analyzers";
import { parseTimestamp } from "../src/lib/panos/analyzers/timestamps";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

const noArtifacts: ParserArtifact[] = [];
type F = { path: string; content: string | null };

console.log("Timestamps");
test("parses PAN-OS and high-res timestamps with precision", () => {
  assert.equal(parseTimestamp("2026/01/10 03:11:22 general").precision, "second");
  assert.equal(parseTimestamp("2026/01/10 03:11:22.123456 x").precision, "high");
  assert.equal(parseTimestamp("0000/00/00 00:00:00 placeholder").precision, "none");
  assert.ok(parseTimestamp("2026/01/10 03:11:22").iso?.startsWith("2026-01-10T03:11:22"));
});

console.log("Resource + Crash analyzers + correlation");
test("OOM and core are detected and correlated by process", () => {
  const files: F[] = [
    { path: "opt/pancfg/mgmt/mp-log/system.log", content: "2026/01/10 03:11:22 general critical Out of memory: Killed process 1234 (mgmtsrvr)" },
    { path: "var/cores/crashinfo", content: "2026/01/10 03:11:25 mgmtsrvr_1234.core" },
  ];
  const r = runDeepAnalysis(noArtifacts, files, "10.2.4", ["SYSTEM_LOG", "CORES"]);
  const oom = r.findings.find((f) => f.ruleId === "RES-OOM");
  const crash = r.findings.find((f) => f.ruleId === "CRASH-CORE");
  assert.ok(oom, "expected RES-OOM");
  assert.ok(crash, "expected CRASH-CORE");
  assert.equal(oom!.details.affectedProcess, "mgmtsrvr");
  // Correlation should link OOM ↔ crash.
  assert.ok(oom!.details.correlation?.some((c) => /crash/i.test(c)), "OOM should note crash correlation");
  assert.ok(crash!.details.correlation?.some((c) => /out-of-memory|out of memory/i.test(c)), "crash should note OOM correlation");
  // Structured events produced for the timeline.
  assert.ok(r.events.some((e) => e.category === "OOM"));
  assert.ok(r.events.some((e) => e.category === "Crash"));
  assert.ok(r.correlationGroups.length > 0);
});

test("packet-diag left enabled is flagged, disabled is not", () => {
  const on = runDeepAnalysis(noArtifacts, [{ path: "tmp/cli/techsupport", content: "debug dataplane packet-diag set capture on" }], "10.2.4", ["CLI_TECHSUPPORT"]);
  assert.ok(on.findings.some((f) => f.ruleId === "RES-PACKET-DIAG"));
  const off = runDeepAnalysis(noArtifacts, [{ path: "tmp/cli/techsupport", content: "packet-diag set capture off" }], "10.2.4", ["CLI_TECHSUPPORT"]);
  assert.ok(!off.findings.some((f) => f.ruleId === "RES-PACKET-DIAG"));
});

console.log("Commit analyzer");
test("detects ID-population failure in ms.log", () => {
  const files: F[] = [{ path: "mp-log/ms.log", content: "2026/01/10 04:00:00 Error populating ID for object type address" }];
  const r = runDeepAnalysis(noArtifacts, files, "10.2.4", ["COMMIT_MANAGER_LOG"]);
  assert.ok(r.findings.some((f) => f.ruleId === "CFG-ID-POPULATION"));
});

console.log("HA analyzer");
test("detects split-brain from ha_agent.log", () => {
  const files: F[] = [{ path: "mp-log/ha_agent.log", content: "2026/01/10 05:00:00 split-brain detected, both peers active" }];
  const artifacts: ParserArtifact[] = [
    { parserName: "ha", artifactType: "ha-status", dataJson: { enabled: true, localState: "active", peerState: "active" }, sourceFilePath: "ha" },
  ];
  const r = runDeepAnalysis(artifacts, files, "10.2.4", ["HA_AGENT_LOG"]);
  assert.ok(r.findings.some((f) => f.ruleId === "HA-SPLIT-BRAIN"));
});

console.log("Interface analyzer");
test("flags CRC counters with physical-layer wording", () => {
  const files: F[] = [{ path: "tmp/cli/logs/sdb.txt", content: "ethernet1/1\n  crc-errors 4200\n  input-errors 4300" }];
  const r = runDeepAnalysis(noArtifacts, files, "10.2.4", ["SDB"]);
  const f = r.findings.find((x) => x.ruleId === "IF-ERROR-COUNTERS");
  assert.ok(f, "expected IF-ERROR-COUNTERS");
  assert.ok(/physical-layer/i.test(f!.details.probableCause ?? ""));
  assert.ok(/remote-side/i.test(f!.recommendation));
});

test("clean bundle yields no deep findings", () => {
  const r = runDeepAnalysis(noArtifacts, [{ path: "mp-log/system.log", content: "2026/01/10 06:00:00 general informational healthy" }], "10.2.4", ["SYSTEM_LOG"]);
  assert.equal(r.findings.length, 0);
});

console.log(`\n${passed} checks passed.`);
