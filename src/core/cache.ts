/**
 * Results cache — stores the last search so IDs persist between commands.
 * `/zmarketplace install 3` refers to the 3rd result from the last search.
 */

import type { PackageResult, AuditReport } from "./types.ts";

let lastResults: PackageResult[] = [];
let lastQuery = "";

/** Store search results. */
export function cacheResults(results: PackageResult[], query: string): void {
  lastResults = results;
  lastQuery = query;
}

/** Get cached results. */
export function getCachedResults(): PackageResult[] {
  return lastResults;
}

/** Get the last query string. */
export function getLastQuery(): string {
  return lastQuery;
}

/** Resolve a reference (ID number or package name) to a cached result. */
export function resolveRef(ref: string): PackageResult | undefined {
  // Try as numeric ID (1-based)
  const id = parseInt(ref, 10);
  if (!isNaN(id) && id >= 1 && id <= lastResults.length) {
    return lastResults[id - 1];
  }
  // Try as package name (case-insensitive)
  return lastResults.find(r => r.name.toLowerCase() === ref.toLowerCase());
}

/** Cache for audit reports by package name. */
const auditCache = new Map<string, AuditReport>();
const MAX_AUDIT_CACHE = 150;

export function cacheAudit(name: string, report: AuditReport): void {
  auditCache.set(name.toLowerCase(), report);
  // Evict oldest if over limit
  if (auditCache.size > MAX_AUDIT_CACHE) {
    const oldest = auditCache.keys().next().value;
    if (oldest) auditCache.delete(oldest);
  }
}

export function getCachedAudit(name: string): AuditReport | undefined {
  const key = name.toLowerCase();
  const entry = auditCache.get(key);
  if (entry) {
    // Promote to most-recently-used (LRU eviction)
    auditCache.delete(key);
    auditCache.set(key, entry);
  }
  return entry;
}
