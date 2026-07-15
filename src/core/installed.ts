/**
 * Installed packages detector — scans pi and omp plugin directories
 * to show ✓ next to already-installed packages.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface InstalledPackage {
  name: string;
  version?: string;
  source: "pi" | "omp";
}

let cache: InstalledPackage[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 10_000; // 10 seconds

/** Scan pi and omp for installed packages. Cached for 10s. */
export function getInstalledPackages(): InstalledPackage[] {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) return cache;

  const results: InstalledPackage[] = [];
  const home = homedir();

  // Scan omp plugins lock file
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

  // Scan pi packages (npm-installed)
  const piNpmDir = join(home, ".pi", "agent", "npm", "node_modules");
  try {
    if (existsSync(piNpmDir)) {
      for (const dir of readdirSync(piNpmDir)) {
        if (dir.startsWith(".")) continue;
        if (dir.startsWith("@")) {
          // Scoped package — read subdirectories
          try {
            for (const sub of readdirSync(join(piNpmDir, dir))) {
              results.push({ name: `${dir}/${sub}`, source: "pi" });
            }
          } catch { /* ignore */ }
        } else {
          results.push({ name: dir, source: "pi" });
        }
      }
    }
  } catch { /* ignore */ }

  // Scan pi packages from settings.json
  const piSettings = join(home, ".pi", "agent", "settings.json");
  try {
    if (existsSync(piSettings)) {
      const data = JSON.parse(readFileSync(piSettings, "utf8")) as { packages?: string[] };
      for (const pkg of data.packages ?? []) {
        const name = pkg.replace(/^npm:/, "").replace(/^git:.*\//, "").replace(/@.*$/, "");
        if (name) results.push({ name, source: "pi" });
      }
    }
  } catch { /* ignore */ }

  cache = results;
  cacheTime = now;
  return results;
}

/** Check if a package name is installed. */
export function isInstalled(name: string): boolean {
  const installed = getInstalledPackages();
  return installed.some(p => p.name === name || p.name === name.replace(/^@[^/]+\//, ""));
}

/** Get installed version of a package, or undefined. */
export function getInstalledVersion(name: string): string | undefined {
  const installed = getInstalledPackages();
  return installed.find(p => p.name === name)?.version;
}

/** Get all installed packages that need updates. */
export function getInstalledWithLatest(): InstalledPackage[] {
  return getInstalledPackages();
}
