// Phase 1A unit tests — pure PAN-OS normalization / version / known-issue logic.
// Run with: npx tsx test/panos-phase1a.test.ts
import assert from "node:assert";
import { classifyPath, buildManifest } from "../src/lib/panos/artifacts";
import { parsePanosVersion, atLeast, buildEvidenceModel } from "../src/lib/panos/version";
import { parseCliSnapshot, looksLikeCliSnapshot } from "../src/lib/panos/cli-snapshot";
import { matchKnownIssues, KNOWN_ISSUE_CATALOG } from "../src/lib/known-issues";

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

console.log("Artifact normalization");
test("classifies physical paths across platform variations", () => {
  assert.equal(classifyPath("opt/pancfg/mgmt/mp-log/system.log")?.id, "SYSTEM_LOG");
  assert.equal(classifyPath("dp0-log/dp-monitor.log")?.id, "DP_MONITOR_LOG");
  assert.equal(classifyPath("s1dp1-log/dp-monitor.log")?.id, "DP_MONITOR_LOG"); // chassis slot
  assert.equal(classifyPath("mp-log/gpsvc.log")?.id, "GLOBALPROTECT_SERVICE_LOG");
  assert.equal(classifyPath("mp-log/appweb3-sslvpn.log")?.id, "GLOBALPROTECT_SERVICE_LOG");
  assert.equal(classifyPath("tmp/cli/logs/sdb.txt")?.id, "SDB");
  assert.equal(classifyPath("var/cores/crashinfo/mp.core.123")?.id, "CORES");
  assert.equal(classifyPath("random/unknown/file.dat"), null);
});
test("manifest reports missing expected evidence for PAN-OS", () => {
  const m = buildManifest(["opt/mp-log/system.log", "config/running-config.xml"], "panos_ngfw");
  assert.ok(m.familiesPresent.includes("SYSTEM_LOG"));
  assert.ok(m.missingEvidence.some((x) => /dp-monitor/i.test(x)));
});

console.log("Version awareness");
test("parses and compares versions", () => {
  assert.equal(parsePanosVersion("10.2.4-h3")?.minor, 2);
  assert.ok(atLeast(parsePanosVersion("11.1.0")!, "10.2"));
  assert.ok(!atLeast(parsePanosVersion("10.1.9")!, "10.2"));
});
test("selects GP service log by version", () => {
  assert.equal(buildEvidenceModel("10.1.9").gpServiceLog, "appweb3-sslvpn.log");
  assert.equal(buildEvidenceModel("10.2.4").gpServiceLog, "gpsvc.log");
  assert.equal(buildEvidenceModel(null).versionKnown, false);
});
test("gates decryption expectation on 11.1", () => {
  assert.ok(buildEvidenceModel("10.2.0").decryptionNotes.some((n) => /not expected/i.test(n)));
  assert.ok(buildEvidenceModel("11.1.0").decryptionNotes.some((n) => /applicable/i.test(n)));
});

console.log("CLI snapshot parser");
test("splits a techsupport dump into commands (fuzzy headers)", () => {
  const dump = [
    "admin@fw> show system info",
    "hostname: fw-lab-01",
    "sw-version: 10.2.4",
    "",
    "> show high-availability state",
    "State: active",
    "--- show interface all ---",
    "ethernet1/1 up",
  ].join("\n");
  assert.ok(looksLikeCliSnapshot(dump));
  const snap = parseCliSnapshot(dump);
  const cmds = snap.sections.map((s) => s.command);
  assert.ok(cmds.includes("show system info"));
  assert.ok(cmds.includes("show high-availability state"));
  assert.ok(cmds.includes("show interface all"));
  const sysinfo = snap.sections.find((s) => s.command === "show system info")!;
  assert.ok(sysinfo.content.includes("sw-version: 10.2.4"));
});

console.log("Known-issue matcher");
test("matches OOM+pan_task as a candidate with evidence", () => {
  const files = [
    { path: "mp-log/system.log", content: "2026-01-01 general critical Out of memory: killed process\npan_task busy" },
  ];
  const res = matchKnownIssues(KNOWN_ISSUE_CATALOG, {
    vendor: "palo_alto",
    product: "panos_ngfw",
    version: "10.2.4",
    familiesPresent: ["SYSTEM_LOG"],
    files,
  });
  const oom = res.find((r) => r.issueId === "PANOS-OOM-PANTASK");
  assert.ok(oom, "expected OOM match");
  assert.ok(["Exact Match", "Strong Candidate"].includes(oom!.matchType));
  assert.ok(oom!.evidence.length > 0);
});
test("respects exclusion patterns (packet-diag disabled → no match)", () => {
  const res = matchKnownIssues(KNOWN_ISSUE_CATALOG, {
    vendor: "palo_alto",
    product: "panos_ngfw",
    version: "10.2.4",
    familiesPresent: [],
    files: [{ path: "cli.txt", content: "packet-diag set filter off\npacket-diag disabled" }],
  });
  assert.ok(!res.some((r) => r.issueId === "PANOS-PACKET-DIAG-LEFT-ON"));
});
test("no false positive on a clean bundle", () => {
  const res = matchKnownIssues(KNOWN_ISSUE_CATALOG, {
    vendor: "palo_alto",
    product: "panos_ngfw",
    version: "10.2.4",
    familiesPresent: ["SYSTEM_LOG"],
    files: [{ path: "mp-log/system.log", content: "2026-01-01 general informational system is healthy" }],
  });
  assert.equal(res.length, 0);
});

console.log(`\n${passed} checks passed.`);
