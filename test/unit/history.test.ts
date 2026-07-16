import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

// history.ts captures HISTORY_DIR from homedir() at module-load time,
// so redirect HOME/USERPROFILE BEFORE the dynamic import.
const tmpHome = mkdtempSync(join(tmpdir(), "zmp-hist-"));
process.env.USERPROFILE = tmpHome;
process.env.HOME = tmpHome;

const { recordSearch, getHistory, clearHistory } = await import("../../src/core/history.ts");
const histFile = join(tmpHome, ".zmarketplace", "history.json");

function cleanup() {
  try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* ignore */ }
}

try {
  console.log("━━━ TEST: recordSearch + getHistory roundtrip ━━━");
  recordSearch("mcp servers", [{ name: "foo-mcp", description: "d", source: "npm" }]);
  let h = getHistory();
  ok("history has 1 entry", h.length === 1);
  ok("query recorded", h[0].query === "mcp servers");
  ok("resultCount recorded", h[0].resultCount === 1);
  ok("topResults captured", h[0].topResults.length === 1);
  ok("topResult name captured", h[0].topResults[0].name === "foo-mcp");

  console.log("\n━━━ TEST: max 100 entries enforced ━━━");
  for (let i = 0; i < 105; i++) recordSearch(`q${i}`, []);
  h = getHistory();
  ok("capped at 100 entries", h.length === 100);
  ok("newest entry is last inserted", h[0].query === "q104");

  console.log("\n━━━ TEST: corrupted JSON -> empty fallback ━━━");
  writeFileSync(histFile, "{not valid json!!!");
  h = getHistory();
  ok("corrupt file yields empty array", Array.isArray(h) && h.length === 0);

  console.log("\n━━━ TEST: clearHistory empties + atomic write leaves no .tmp ━━━");
  recordSearch("again", [{ name: "x", description: "d", source: "npm" }]);
  ok("entry present before clear", getHistory().length === 1);
  clearHistory();
  h = getHistory();
  ok("cleared -> empty", h.length === 0);
  ok("no leftover .tmp file", !existsSync(histFile + ".tmp"));
} finally {
  cleanup();
}

console.log(`\n━━━ RESULTS: ${pass} passed, ${fail} failed ━━━`);
if (fail > 0) process.exit(1);
