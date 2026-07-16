/**
 * Installed packages detector — checks pi and omp for user-installed plugins.
 * Only checks explicit plugin installs, NOT dependency node_modules.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface InstalledPackage {
  name: string;
  version?: string;
  source: "pi" | "omp";
}

let cache: InstalledPackage[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 10_000;

/** Get user-installed packages from pi and omp (not dependencies). */
export function getInstalledPackages(): InstalledPackage[] {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) return cache;

  const results: InstalledPackage[] = [];
  const home = homedir();

  // omp plugins — from lock file (only explicitly enabled plugins)
  const ompLock = join(home, ".omp", "plugins", "omp-plugins.lock.json");
  try {
    if (existsSync(ompLock)) {
      const data = JSON.parse(readFileSync(ompLock, "utf8")) as { plugins?: Record<string, { version?: string; enabled?: boolean }> };
      for (const [name, info] of Object.entries(data.plugins ?? {})) {
        if (info.enabled !== false) {
          results.push({ name, version: info.version, source: "omp" });
        }
      }
    }
  } catch { /* ignore */ }

  // pi packages — from settings.json packages array (NOT node_modules scan)
  const piSettings = join(home, ".pi", "agent", "settings.json");
  try {
    if (existsSync(piSettings)) {
      const data = JSON.parse(readFileSync(piSettings, "utf8")) as { packages?: string[]; extensions?: string[] };
      for (const pkg of data.packages ?? []) {
        // Format: "npm:@scope/name@version" or "npm:name" or "git:..."
        const cleaned = pkg.replace(/^npm:/, "").replace(/^git:.*\//, "").replace(/@\d+\.\d+\.\d+[\w.\-]*$/, "");
        if (cleaned) results.push({ name: cleaned, source: "pi" });
      }
    }
  } catch { /* ignore */ }

  // Deduplicate (keep first = prefer omp with version info)
  const seen = new Set<string>();
  const deduped = results.filter(r => {
    if (seen.has(r.name)) return false;
    seen.add(r.name);
    return true;
  });

  cache = deduped;
  cacheTime = now;
  return deduped;
}

/** Check if a package name is installed (user plugin, not dependency). */
export function isInstalled(name: string): boolean {
  const packages = getInstalledPackages();
  const normalized = name.replace(/^@[^/]+\//, "");
  return packages.some(p =>
    p.name === name ||
    p.name === normalized ||
    p.name.endsWith("/" + normalized)
  );
}

/** Get installed version of a package, or undefined. */
export function getInstalledVersion(name: string): string | undefined {
  return getInstalledPackages().find(p => p.name === name)?.version;
}
