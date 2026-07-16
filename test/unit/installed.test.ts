import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// installed.ts calls homedir() at call-time (not module-load), so a static
// import is safe — the env redirect below takes effect before any call.
import { getInstalledPackages, isInstalled, getInstalledVersion } from "../../src/core/installed.ts";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

const tmpHome = mkdtempSync(join(tmpdir(), "zmp-inst-"));
process.env.USERPROFILE = tmpHome;
process.env.HOME = tmpHome;

// Fixture: omp plugin lock file (only explicitly-enabled plugins)
const ompDir = join(tmpHome, ".omp", "plugins");
mkdirSync(ompDir, { recursive: true });
writeFileSync(join(ompDir, "omp-plugins.lock.json"), JSON.stringify({
  plugins: {
    "bigpowers": { version: "2.77.0", enabled: true },
    "disabled-pkg": { version: "1.0.0", enabled: false },
    "pi-subagents": { version: "0.34.0" },
  },
}));

// Fixture: pi settings.json packages array (npm:/git: prefix + version stripping)
const piDir = join(tmpHome, ".pi", "agent");
mkdirSync(piDir, { recursive: true });
writeFileSync(join(piDir, "settings.json"), JSON.stringify({
  packages: ["npm:@scope/scoped-pkg@3.1.0", "npm:plain-pkg", "git:https://github.com/foo/git-pkg"],
  extensions: [],
}));

try {
  console.log("━━━ TEST: getInstalledPackages reads fixtures ━━━");
  const pkgs = getInstalledPackages();
  const names = pkgs.map(p => p.name);
  ok("omp enabled pkg detected", names.includes("bigpowers"));
  ok("omp disabled pkg excluded", !names.includes("disabled-pkg"));
  ok("omp pkg without enabled flag detected", names.includes("pi-subagents"));
  ok("pi scoped pkg (npm: prefix + version stripped)", names.includes("@scope/scoped-pkg"));
  ok("pi plain pkg (npm: prefix stripped)", names.includes("plain-pkg"));
  ok("pi git pkg (git: prefix stripped)", names.includes("git-pkg"));

  console.log("\n━━━ TEST: isInstalled ━━━");
  ok("isInstalled true for bigpowers", isInstalled("bigpowers") === true);
  ok("isInstalled true for scoped (normalized)", isInstalled("@scope/scoped-pkg") === true);
  ok("isInstalled false for unknown", isInstalled("does-not-exist") === false);
  ok("isInstalled false for disabled pkg", isInstalled("disabled-pkg") === false);

  console.log("\n━━━ TEST: getInstalledVersion ━━━");
  ok("version for bigpowers", getInstalledVersion("bigpowers") === "2.77.0");
  ok("version undefined for pi pkg (none stored)", getInstalledVersion("plain-pkg") === undefined);
  ok("version undefined for unknown", getInstalledVersion("nope") === undefined);
} finally {
  try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log(`\n━━━ RESULTS: ${pass} passed, ${fail} failed ━━━`);
if (fail > 0) process.exit(1);
