/**
 * Official MCP Registry adapter — queries registry.modelcontextprotocol.io.
 * Free, no auth required. Returns MCP server metadata.
 */

import type { PackageResult, PackageType, RegistrySource } from "../core/types.ts";

const MCP_REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0.1/servers";

interface McpRegistryServer {
  name?: string;
  description?: string;
  repository?: { url?: string; source?: string };
  version_detail?: { version?: string };
  authors?: Array<{ name?: string; email?: string }>;
  homepage?: string;
  license?: string;
}

interface McpRegistryResponse {
  servers?: McpRegistryServer[];
  next_cursor?: string;
}

/** Search the official MCP registry. */
export async function searchMcpRegistry(query: string, limit = 25): Promise<PackageResult[]> {
  const q = query.toLowerCase().trim();
  const results: PackageResult[] = [];
  let cursor: string | undefined;

  // Paginate until we have enough results or run out
  for (let page = 0; page < 5 && results.length < limit; page++) {
    const url = cursor
      ? `${MCP_REGISTRY_URL}?cursor=${encodeURIComponent(cursor)}&limit=100`
      : `${MCP_REGISTRY_URL}?limit=100`;

    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) break;
      const data = await resp.json() as McpRegistryResponse;
      const servers = data.servers ?? [];

      for (const srv of servers) {
        const name = srv.name ?? "unknown";
        const desc = srv.description ?? "";
        // Filter by query
        if (q && !name.toLowerCase().includes(q) && !desc.toLowerCase().includes(q)) continue;

        const repo = srv.repository?.url ?? srv.repository?.source;
        const author = srv.authors?.[0]?.name;

        results.push({
          name,
          description: desc,
          version: srv.version_detail?.version,
          author,
          ecosystems: ["universal"],
          type: "mcp" as PackageType,
          source: "mcp-registry" as RegistrySource,
          homepage: srv.homepage ?? repo,
          repository: repo,
          license: srv.license,
          installCommand: `npx ${name}`,
        });

        if (results.length >= limit) break;
      }

      cursor = data.next_cursor;
      if (!cursor) break;
    } catch {
      break;
    }
  }

  return results;
}
