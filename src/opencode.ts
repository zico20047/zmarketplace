/**
 * OpenCode plugin entry point.
 *
 * OpenCode plugins export functions that return hooks.
 * This plugin provides a `zmarketplace` tool the agent can call.
 *
 * OpenCode does NOT support slash commands from plugins.
 * For /zmarketplace, create a command file:
 *   ~/.config/opencode/commands/zmarketplace.md
 *
 * Install: add "zmarketplace" to opencode.json plugin array.
 */

import { search } from "./core/search.ts";
import { getDetail } from "./core/detail.ts";
import { auditPackage } from "./core/audit.ts";
import type { SearchOptions } from "./core/types.ts";

interface ToolContext {
  sessionID?: string;
  messageID?: string;
  agent?: string;
  directory?: string;
  worktree?: string;
  ask?(message: string): Promise<string>;
}

interface ToolDef {
  description: string;
  args: Record<string, unknown>;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

interface PluginCtx {
  project?: unknown;
  client?: unknown;
  directory?: string;
  worktree?: string;
}

/** The zmarketplace tool definition. */
const zmarketplaceTool: ToolDef = {
  description:
    "Search, inspect, audit, and install packages across agent ecosystems " +
    "(pi, omp, claude code, opencode, gemini cli, codex). " +
    "Actions: search, detail, audit. " +
    "Sources: npm, Claude marketplace, Gemini extensions, MCP registry, Smithery, GitHub.",
  args: {
    action: { type: "string", description: "search, detail, or audit" },
    query: { type: "string", description: "Search query (for search)" },
    name: { type: "string", description: "Package name (for detail/audit)" },
    ecosystem: {
      type: "string",
      description: "Filter: pi, claude, opencode, gemini, codex, npm, all",
    },
    limit: { type: "number", description: "Max results (default 20)" },
  },

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = args["action"] as string;

    if (action === "search") {
      const opts: SearchOptions = {
        query: (args["query"] as string) ?? "",
        ecosystem: (args["ecosystem"] as SearchOptions["ecosystem"]) ?? "all",
        limit: (args["limit"] as number) ?? 20,
      };
      const results = await search(opts);
      if (results.length === 0) return "No packages found.";
      return results.map(r =>
        `${r.name} [${r.ecosystems.filter(e => e !== "unknown").join(",")}] (${r.source})\n  ${r.description.slice(0, 100)}\n  Install: ${r.installCommand ?? "n/a"}`
      ).join("\n\n");
    }

    if (action === "detail") {
      const name = args["name"] as string;
      if (!name) return "Error: name required.";
      const detail = await getDetail(name);
      if (!detail) return `Package "${name}" not found.`;
      return `${detail.name} v${detail.version}\n${detail.description}\nDeps: ${detail.dependencyCount}  Size: ${detail.size ? (detail.size / 1024).toFixed(1) + " KB" : "?"}\n${detail.npmUrl ?? ""}`;
    }

    if (action === "audit") {
      const name = args["name"] as string;
      if (!name) return "Error: name required.";
      const report = await auditPackage(name, { deepScan: true });
      return `${report.summary}\nFindings:\n${report.findings.map(f => `[${f.severity}] ${f.reason}`).join("\n") || "None"}`;
    }

    return `Unknown action: ${action}`;
  },
};

/** OpenCode plugin — provides zmarketplace as a tool the agent can call. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ZmarketplacePlugin = async (_ctx: PluginCtx): Promise<{ tool: Record<string, ToolDef> }> => {
  return {
    tool: {
      zmarketplace: zmarketplaceTool,
    },
  };
};

export default ZmarketplacePlugin;
