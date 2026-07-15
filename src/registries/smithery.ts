/**
 * Smithery MCP registry adapter — queries api.smithery.ai for MCP servers.
 */

import type { PackageResult, PackageType, RegistrySource } from "../core/types.ts";

const SMITHERY_URL = "https://api.smithery.ai/v1/servers";

interface SmitheryServer {
  qualifiedName?: string;
  displayName?: string;
  description?: string;
  shortDescription?: string;
  repository?: { url?: string; source?: string };
  latestVersion?: string;
  author?: { name?: string };
}

interface SmitheryResponse {
  servers?: SmitheryServer[];
}

/** Search Smithery MCP registry. */
export async function searchSmithery(query: string, limit = 25): Promise<PackageResult[]> {
  const q = query.toLowerCase().trim();
  const url = q
    ? `${SMITHERY_URL}?q=${encodeURIComponent(query)}&page=1&pageSize=${limit}`
    : `${SMITHERY_URL}?page=1&pageSize=${limit}`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return [];
    const data = await resp.json() as SmitheryResponse;
    const servers = data.servers ?? [];

    return servers.slice(0, limit).map(srv => ({
      name: srv.qualifiedName ?? srv.displayName ?? "unknown",
      description: srv.shortDescription ?? srv.description ?? "",
      version: srv.latestVersion,
      author: srv.author?.name,
      ecosystems: ["universal"] as const,
      type: "mcp" as PackageType,
      source: "smithery" as RegistrySource,
      homepage: srv.repository?.url ?? srv.repository?.source,
      repository: srv.repository?.url,
      installCommand: `npx @smithery/cli install ${srv.qualifiedName ?? srv.displayName ?? ""}`,
    }));
  } catch {
    return [];
  }
}
