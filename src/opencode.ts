/**
 * OpenCode plugin entry point.
 *
 * OpenCode plugins are npm packages with `exports["./server"]` pointing here.
 * They export a Plugin function that returns hooks.
 *
 * Install in opencode:
 *   opencode plugin zmarketplace
 *
 * Or add to opencode.json:
 *   { "plugin": ["zmarketplace"] }
 */

import { search } from "./core/search.ts";
import { getDetail } from "./core/detail.ts";
import { auditPackage } from "./core/audit.ts";
import { installPackage } from "./core/install.ts";
import type { SearchOptions } from "./core/types.ts";

/**
 * Minimal OpenCode plugin type shape.
 * Not imported from @opencode-ai/plugin to keep zero deps.
 */
interface OpenCodeToolContext {
  sessionID?: string;
  messageID?: string;
  agent?: string;
  directory?: string;
  ask?(message: string): Promise<string>;
}

interface OpenCodePluginParams {
  project?: string;
  serverUrl?: string;
  // Bun shell `$`
  $?: unknown;
}

interface OpenCodeHooks {
  "tool.definition"?: (tools: unknown[]) => unknown[];
}

type PluginFn = (params: OpenCodePluginParams) => Promise<OpenCodeHooks>;

const ZMARKETPLACE_TOOL = {
  type: "function" as const,
  function: {
    name: "zmarketplace",
    description:
      "Search, inspect, audit, and install packages across agent ecosystems. " +
      "Actions: search, detail, audit, install.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "detail", "audit", "install"] },
        query: { type: "string" },
        name: { type: "string" },
        type: { type: "string", enum: ["extension", "skill", "theme", "prompt", "plugin", "mcp", "all"] },
        ecosystem: { type: "string", enum: ["pi", "omp", "claude", "opencode", "gemini", "codex", "all"] },
        limit: { type: "number" },
        deepScan: { type: "boolean" },
        skipAudit: { type: "boolean" },
      },
      required: ["action"],
    },
    execute: async (args: Record<string, unknown>, _ctx: OpenCodeToolContext): Promise<string> => {
      const action = args["action"] as string;

      if (action === "search") {
        const opts: SearchOptions = {
          query: (args["query"] as string) ?? "",
          type: (args["type"] as SearchOptions["type"]) ?? "all",
          ecosystem: (args["ecosystem"] as SearchOptions["ecosystem"]) ?? "all",
          limit: (args["limit"] as number) ?? 20,
        };
        const results = await search(opts);
        return results.length === 0
          ? "No packages found."
          : results.map(r => `${r.name} [${r.ecosystems.filter(e => e !== "unknown").join(",")}] — ${r.description}`).join("\n");
      }

      if (action === "detail") {
        const name = args["name"] as string;
        if (!name) return "Error: 'name' required for detail.";
        const detail = await getDetail(name);
        if (!detail) return `Package "${name}" not found.`;
        return `${detail.name} v${detail.version}\n${detail.description}\nDeps: ${detail.dependencyCount}  Size: ${detail.size ? (detail.size / 1024).toFixed(1) + " KB" : "?"}\n${detail.npmUrl}`;
      }

      if (action === "audit") {
        const name = args["name"] as string;
        if (!name) return "Error: 'name' required for audit.";
        const report = await auditPackage(name, { deepScan: (args["deepScan"] as boolean) ?? true });
        return report.summary + "\n" + (report.findings.map(f => `[${f.severity.toUpperCase()}] ${f.reason}`).join("\n") || "No findings.");
      }

      if (action === "install") {
        const name = args["name"] as string;
        if (!name) return "Error: 'name' required for install.";
        const result = await installPackage(name, { skipAudit: (args["skipAudit"] as boolean) ?? false });
        return result.message;
      }

      return `Unknown action: ${action}`;
    },
  },
};

const ZmarketplacePlugin: PluginFn = async (_params: OpenCodePluginParams) => {
  return {
    "tool.definition": (tools: unknown[]) => {
      tools.push(ZMARKETPLACE_TOOL);
      return tools;
    },
  };
};

export default ZmarketplacePlugin;
export { ZmarketplacePlugin };
