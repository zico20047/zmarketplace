import { cacheResults, resolveRef, cacheAudit, getCachedAudit } from "../../src/core/cache.ts";
import type { PackageResult, AuditReport } from "../../src/core/types.ts";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

function makeResult(name: string): PackageResult {
  return { name, description: "test", ecosystems: ["npm"], type: "plugin", source: "npm" };
}

function makeReport(name: string): AuditReport {
  return {
    packageName: name,
    version: "1.0.0",
    risk: "safe",
    metadataFindings: [],
    sourceFindings: [],
    findings: [],
    deepScanned: false,
    summary: "ok",
  };
}

console.log("━━━ TEST: cacheResults + resolveRef ━━━");
const r1 = makeResult("alpha");
const r2 = makeResult("beta");
const r3 = makeResult("gamma");
cacheResults([r1, r2, r3], "test-query");
ok("resolveRef by number 1", resolveRef("1")?.name === "alpha");
ok("resolveRef by number 2", resolveRef("2")?.name === "beta");
ok("resolveRef by number 3", resolveRef("3")?.name === "gamma");
ok("resolveRef out of range -> undefined", resolveRef("99") === undefined);
ok("resolveRef by name (case-insensitive)", resolveRef("BETA")?.name === "beta");
ok("resolveRef unknown name -> undefined", resolveRef("nope") === undefined);

console.log("\n━━━ TEST: cacheAudit LRU eviction ━━━");
// Flood to guarantee a full cache regardless of prior module state (pure FIFO, no promotion)
for (let i = 0; i < 200; i++) cacheAudit(`flood-${i}`, makeReport(`flood-${i}`));
// Insert exactly MAX_AUDIT_CACHE (150) fresh keys in insertion order k0..k149
for (let i = 0; i < 150; i++) cacheAudit(`k${i}`, makeReport(`k${i}`));
// All flood keys should have been evicted by the 150 fresh inserts
ok("flood keys evicted", getCachedAudit("flood-199") === undefined);
// Access k0 -> promotes it to most-recently-used
const hit0 = getCachedAudit("k0");
ok("k0 resolvable after access", hit0?.packageName === "k0");
// Insert one more -> eviction must remove the new oldest (k1), NOT k0 (promoted)
cacheAudit("k150", makeReport("k150"));
ok("k0 survives eviction (LRU promoted)", getCachedAudit("k0")?.packageName === "k0");
ok("k1 evicted (was oldest after k0 promotion)", getCachedAudit("k1") === undefined);
ok("k150 present", getCachedAudit("k150")?.packageName === "k150");

console.log(`\n━━━ RESULTS: ${pass} passed, ${fail} failed ━━━`);
if (fail > 0) process.exit(1);
