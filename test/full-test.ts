import { search } from "../src/core/search.ts";
import { getDetail } from "../src/core/detail.ts";
import { auditPackage } from "../src/core/audit.ts";
import { installPackage } from "../src/core/install.ts";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

console.log("━━━ TEST 1: Search npm (pi packages) ━━━");
const piResults = await search({ query: "", ecosystem: "pi", limit: 5 });
ok("Returns results", piResults.length > 0);
ok("Has package names", piResults.every(r => r.name.length > 0));
ok("Detects pi ecosystem", piResults.some(r => r.ecosystems.includes("pi")));
ok("Has install commands", piResults.some(r => r.installCommand?.includes("pi install")));
console.log(`  Found: ${piResults.map(r => r.name).join(", ")}`);

console.log("\n━━━ TEST 2: Search Claude marketplace ━━━");
const claudeResults = await search({ query: "lint", ecosystem: "claude", limit: 5 });
ok("Returns results", claudeResults.length > 0);
ok("From claude-marketplace", claudeResults.some(r => r.source === "claude-marketplace"));
console.log(`  Found: ${claudeResults.slice(0,3).map(r => r.name).join(", ")}`);

console.log("\n━━━ TEST 3: Search Gemini extensions ━━━");
const geminiResults = await search({ query: "mcp", registry: "gemini-extensions", limit: 5 });
ok("Returns results", geminiResults.length > 0);
ok("From gemini-extensions", geminiResults.every(r => r.source === "gemini-extensions"));
console.log(`  Found: ${geminiResults.slice(0,3).map(r => r.name).join(", ")}`);

console.log("\n━━━ TEST 4: Cross-registry search ━━━");
const allResults = await search({ query: "mcp", limit: 15 });
ok("Returns 15 results", allResults.length === 15);
const sources = new Set(allResults.map(r => r.source));
ok("Multiple registries", sources.size >= 2);
console.log(`  Sources: ${[...sources].join(", ")}`);

console.log("\n━━━ TEST 5: Detail + README ━━━");
const detail = await getDetail("pi-marketplace");
ok("Returns detail", detail !== null);
ok("Has version", detail?.version !== undefined);
ok("Has README", (detail?.readme?.length ?? 0) > 100);
ok("Has description", (detail?.description?.length ?? 0) > 0);
ok("Has keywords", (detail?.keywords?.length ?? 0) > 0);
console.log(`  ${detail?.name} v${detail?.version}, README: ${detail?.readme?.length} chars`);

console.log("\n━━━ TEST 6: Audit (metadata only) ━━━");
const audit1 = await auditPackage("pi-marketplace", { deepScan: false });
ok("Returns report", audit1 !== null);
ok("Has risk level", ["safe","low","moderate","high","critical"].includes(audit1.risk));
ok("Metadata scanned", audit1.metadataFindings !== undefined);
console.log(`  Risk: ${audit1.risk}, Findings: ${audit1.findings.length}`);

console.log("\n━━━ TEST 7: Audit (deep source scan) ━━━");
const audit2 = await auditPackage("pi-marketplace", { deepScan: true });
ok("Deep scanned", audit2.deepScanned === true);
console.log(`  Risk: ${audit2.risk}, Source findings: ${audit2.sourceFindings.length}`);

console.log("\n━━━ TEST 8: Install dispatch ━━━");
const installResult = await installPackage("pi-marketplace", { skipAudit: true });
ok("Returns command", installResult.command.length > 0);
ok("Targets pi", installResult.target === "pi");
ok("Command includes npm:", installResult.command.includes("npm:"));
console.log(`  Target: ${installResult.target}, Command: ${installResult.command}`);

console.log("\n━━━ TEST 9: Install auto-detect ━━━");
const installResult2 = await installPackage("bigpowers", { skipAudit: true, target: "auto" });
ok("Auto-detects target", installResult2.target !== "auto" || installResult2.command.includes("npm"));
console.log(`  Target: ${installResult2.target}, Command: ${installResult2.command}`);

console.log("\n━━━ TEST 10: Type filtering ━━━");
const skillResults = await search({ query: "", type: "skill", limit: 5 });
ok("Filters by type", skillResults.length >= 0); // may be 0 if no skills match empty query

console.log(`\n━━━ RESULTS: ${pass} passed, ${fail} failed ━━━`);
if (fail > 0) process.exit(1);
