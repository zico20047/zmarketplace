/**
 * Claude marketplace adapter — fetches plugin catalogs from GitHub raw.
 * Sources: anthropics/claude-plugins-official + anthropics/claude-plugins-community.
 */

import type { PackageResult, PackageType, RegistrySource } from "../core/types.ts";

const MARKETPLACE_URLS = [
  "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json",
  "https://raw.githubusercontent.com/anthropics/claude-plugins-community/main/.claude-plugin/marketplace.json",
] as const;

interface MarketplacePlugin {
  name: string;
  description?: string;
  source: string | { source: string; url?: string; repo?: string; ref?: string };
  version?: string;
  author?: { name?: string; email?: string } | string;
  homepage?: string;
  repository?: string | { url?: string };
  license?: string;
  keywords?: string[];
  category?: string;
}

interface MarketplaceCatalog {
  name: string;
  owner?: { name?: string };
  plugins: MarketplacePlugin[];
}

/** Search the Claude marketplace catalogs. */
export async function searchClaudeMarketplace(query: string, limit = 25): Promise<PackageResult[]> {
  const catalogs = await Promise.allSettled(
    MARKETPLACE_URLS.map(async url => {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json() as MarketplaceCatalog;
    }),
  );

  const results: PackageResult[] = [];
  const q = query.toLowerCase().trim();

  for (const settled of catalogs) {
    if (settled.status !== "fulfilled") continue;
    for (const plugin of settled.value.plugins) {
      const name = plugin.name.toLowerCase();
      const desc = (plugin.description ?? "").toLowerCase();
      // No query → return all; otherwise match name or description
      if (q && !name.includes(q) && !desc.includes(q)) continue;

      const repo = typeof plugin.repository === "string"
        ? plugin.repository
        : plugin.repository?.url;
      const author = typeof plugin.author === "string"
        ? plugin.author
        : plugin.author?.name;

      results.push({
        name: plugin.name,
        description: plugin.description ?? "",
        version: plugin.version,
        author,
        ecosystems: ["claude"],
        type: (plugin.category === "theme" ? "theme" : "plugin") as PackageType,
        source: "claude-marketplace" as RegistrySource,
        homepage: plugin.homepage ?? repo,
        repository: repo,
        license: plugin.license,
        installCommand: `claude plugin install ${plugin.name}`,
      });

      if (results.length >= limit) break;
    }
    if (results.length >= limit) break;
  }

  return results;
}
