/**
 * OpenCode plugin — provides zmarketplace as a tool.
 * Uses bunx CLI under the hood (no complex logic that can crash).
 *
 * Install: add "zmarketplace" to opencode.json plugin array.
 */

interface ShellAPI {
  // Bun shell template literal
  (strings: TemplateStringsArray, ...values: unknown[]): { quiet(): Promise<{ stdout: Buffer; stderr: Buffer; exitCode: number }> };
}

interface PluginCtx {
  project?: unknown;
  directory?: string;
  worktree?: string;
  $?: ShellAPI;
}

/** Run a shell command and return stdout as string. */
async function runCmd($: ShellAPI | undefined, cmd: string): Promise<string> {
  if (!$) return "Error: shell not available. Use: bunx zmarketplace " + cmd;
  try {
    const result = await $`bunx zmarketplace ${cmd}`.quiet();
    const stdout = result.stdout?.toString() ?? "";
    const stderr = result.stderr?.toString() ?? "";
    return stdout || stderr || "No output.";
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** OpenCode plugin — registers zmarketplace tool. */
export const ZmarketplacePlugin = async (ctx: PluginCtx) => {
  const $ = ctx.$;
  return {
    tool: {
      zmarketplace: {
        description:
          "Search, inspect, audit, and install packages across agent ecosystems " +
          "(pi, omp, claude, opencode, gemini, codex, npm). " +
          "Actions: search <query>, detail <name>, audit <name>",
        args: {
          action: { type: "string", description: "search, detail, or audit" },
          query: { type: "string", description: "Search query or package name" },
        },
        async execute(args: { action?: string; query?: string }): Promise<string> {
          const action = args.action ?? "search";
          const query = args.query ?? "";

          if (action === "detail") return runCmd($, `detail ${query}`);
          if (action === "audit") return runCmd($, `audit ${query}`);
          return runCmd($, `search "${query}" --limit=10`);
        },
      },
    },
  };
};

export default ZmarketplacePlugin;
