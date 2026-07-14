/**
 * Unified search engine — aggregates results across all registries.
 * Deduplicates and ranks by relevance.
 */

import type { PackageResult, SearchOptions, Ecosystem, RegistrySource } from "./types.ts";
import { searchNpm, detectEcosystems } from "../registries/npm.ts";
import { searchClaudeMarketplace } from "../registries/claude.ts";
import { searchGeminiExtensions } from "../registries/gemini.ts";

/** Determine which registries to query based on options. */
function registriesForOptions(registry?: RegistrySource | "all"): RegistrySource[] {
  if (!registry || registry === "all") {
    return ["npm", "claude-marketplace", "gemini-extensions"];
  }
  return [registry];
}

/** Map a user-facing ecosystem filter to npm ecosystem list for the npm adapter. */
function ecosystemsForFilter(ecosystem?: Ecosystem | "all"): Ecosystem[] | undefined {
  if (!ecosystem || ecosystem === "all") return undefined;
  // pi and omp share the same npm keyword
  if (ecosystem === "omp") return ["pi"];
  return [ecosystem];
}

/** Deduplicate results by package name, preferring npm source for richer metadata. */
function deduplicate(results: PackageResult[]): PackageResult[] {
  const byName = new Map<string, PackageResult>();
  for (const r of results) {
    const key = r.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, r);
    } else {
      // Merge: union ecosystems, keep richer source
      byName.set(key, {
        ...existing,
        ecosystems: [...new Set([...existing.ecosystems, ...r.ecosystems])],
        source: existing.source === "npm" ? existing.source : r.source,
      });
    }
  }
  return [...byName.values()];
}

/** Score a result by how well it matches the query. */
function scoreResult(result: PackageResult, query: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  const name = result.name.toLowerCase();
  const desc = result.description.toLowerCase();

  let score = 0;
  if (name === q) score += 100;
  else if (name.startsWith(q)) score += 50;
  else if (name.includes(q)) score += 25;
  if (desc.includes(q)) score += 10;
  // Prefer packages with known ecosystems
  score += result.ecosystems.filter(e => e !== "unknown").length * 5;
  return score;
}

/** Execute a unified search across all configured registries. */
export async function search(options: SearchOptions): Promise<PackageResult[]> {
  const limit = options.limit ?? 20;
  const registries = registriesForOptions(options.registry);
  const ecosystems = ecosystemsForFilter(options.ecosystem);

  const queries: Promise<PackageResult[]>[] = [];

  if (registries.includes("npm")) {
    queries.push(searchNpm(options.query, { ecosystems, type: options.type, limit }));
  }
  if (registries.includes("claude-marketplace")) {
    queries.push(searchClaudeMarketplace(options.query, limit));
  }
  if (registries.includes("gemini-extensions")) {
    queries.push(searchGeminiExtensions(options.query, limit));
  }

  const settled = await Promise.allSettled(queries);
  let results = settled
    .filter((s): s is PromiseFulfilledResult<PackageResult[]> => s.status === "fulfilled")
    .flatMap(s => s.value);

  // Filter by type
  if (options.type && options.type !== "all") {
    results = results.filter(r => r.type === options.type);
  }

  // Filter by ecosystem
  if (options.ecosystem && options.ecosystem !== "all") {
    results = results.filter(r => r.ecosystems.includes(options.ecosystem as Ecosystem));
  }

  // Deduplicate
  results = deduplicate(results);

  // Rank: exact name > name prefix > name contains > description match
  results.sort((a, b) => scoreResult(b, options.query) - scoreResult(a, options.query));

  return results.slice(0, limit);
}
