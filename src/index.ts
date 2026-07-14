/**
 * zmarketplace — /zmarketplace slash command for pi/omp.
 *
 * Flow: /zmarketplace → type query → browse results → enter → detail+README → install (audit first)
 */

import { search } from "./core/search.ts";
import { getDetail } from "./core/detail.ts";
import { auditPackage } from "./core/audit.ts";
import { cacheResults, resolveRef, cacheAudit } from "./core/cache.ts";
import { formatResultOption, formatAuditReport, formatHelp, parseArgs } from "./core/tui.ts";
import type { PackageResult } from "./core/types.ts";

// ── Types ──────────────────────────────────────────────────────────────────

interface UI {
  select(title: string, options: Array<string | { label: string; description?: string }>): Promise<string | undefined>;
  confirm(title: string, message: string): Promise<boolean>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  notify(message: string, level?: string): void;
  setStatus?(message: string): void;
}

interface Ctx { cwd: string; hasUI: boolean; ui: UI }

// ── Helpers ────────────────────────────────────────────────────────────────

function openUrl(url: string): void {
  if (process.platform === "win32") Bun.spawn(["cmd", "/c", "start", "", url], { stdout: "ignore", stderr: "ignore" });
  else if (process.platform === "darwin") Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
  else Bun.spawn(["xdg-open", url], { stdout: "ignore", stderr: "ignore" });
}

function extractUrl(line: string, repoBase?: string): string | null {
  const direct = line.match(/https?:\/\/[^\s)>]+/);
  if (direct) return direct[0].replace(/[.)]+$/, "");
  const rel = line.match(/🖼 IMAGE: (.+)/);
  if (rel && repoBase) return `${repoBase}/raw/main/${rel[1].replace(/^\.\//, "")}`;
  return null;
}

// ── Search ─────────────────────────────────────────────────────────────────

async function doSearch(query: string, ctx: Ctx, limit = 50): Promise<void> {
  ctx.ui.setStatus?.("Searching...");
  const results = await search({ query, limit, type: "all", ecosystem: "all" });
  cacheResults(results, query);
  if (results.length === 0) { ctx.ui.notify("No packages found.", "warning"); return; }
  ctx.ui.notify(`Found ${results.length} packages.`, "info");
  await browseResults(results, ctx);
}

async function browseResults(results: PackageResult[], ctx: Ctx): Promise<void> {
  const options = results.map((r, i) => ({ label: formatResultOption(r, i).label, description: r.installCommand ?? "" }));
  options.push({ label: "↩ Done", description: "" });
  const selected = await ctx.ui.select(`zmarketplace: ${results.length} results`, options);
  if (!selected || selected === "↩ Done") return;
  const match = selected.match(/\[(\d+)\]/);
  if (!match) return;
  const pkg = results[parseInt(match[1], 10) - 1];
  if (pkg) await packageDetail(pkg, ctx);
}

// ── Detail + README ────────────────────────────────────────────────────────

async function packageDetail(pkg: PackageResult, ctx: Ctx): Promise<void> {
  ctx.ui.setStatus?.(`Loading ${pkg.name}...`);
  const detail = await getDetail(pkg.name);
  if (!detail) { ctx.ui.notify(`"${pkg.name}" not found.`, "warning"); return; }

  const repoBase = detail.repository?.replace(/^git\+/, "").replace(/\.git$/, "");
  const lines: string[] = [
    `📦 ${detail.name} v${detail.version ?? "?"}`,
    detail.description || "",
    `License: ${detail.license ?? "?"}  Deps: ${detail.dependencyCount ?? "?"}  Size: ${detail.size ? (detail.size / 1024).toFixed(1) + " KB" : "?"}`,
    `Published: ${detail.publishedAt?.slice(0, 10) ?? "?"}`,
  ];
  if (detail.keywords?.length) lines.push(`Keywords: ${detail.keywords.join(", ")}`);
  if (detail.npmUrl) lines.push(`🔗 ${detail.npmUrl}`);
  if (repoBase) lines.push(`🔗 ${repoBase}`);

  // Actions at TOP (easy to reach without scrolling)
  lines.push("⬇ Install (audit first)");
  lines.push("🔒 Audit only");
  lines.push("↩ Back to results");

  if (detail.readme) {
    lines.push("━━━ README (enter on 🔗/🖼 to open) ━━━");
    const rl = detail.readme
      .replace(/!\[.*?\]\((https?:\/\/[^)]+)\)/g, "\n🖼 IMAGE: $1\n")
      .replace(/!\[.*?\]\(([^)]+)\)/g, (_m, p) => `\n🖼 IMAGE: ${repoBase ? repoBase + "/raw/main/" + p.replace(/^\.\//, "") : p}\n`)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 → $2")
      .replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (_m, p) => `\n🖼 IMAGE: ${p}\n`)
      .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "$2 → $1")
      .replace(/<[^>]+>/g, "")
      .split("\n").map(l => l.trimEnd()).filter(l => l.length > 0)
      .slice(0, 150); // cap at 150 lines to prevent lag
    lines.push(...rl);
    if (detail.readme.length > 8000) lines.push("...(truncated — see npm for full README)");
  }

  while (true) {
    const selected = await ctx.ui.select(`${detail.name} — Details`, lines);
    if (!selected) return;
    if (selected.includes("Back to results")) return;
    if (selected.includes("Install")) { await doInstall(pkg, ctx); return; }
    if (selected.includes("Audit only")) { await doAudit(pkg.name, ctx); continue; }
    const url = extractUrl(selected, repoBase);
    if (url) { openUrl(url); ctx.ui.notify("🌐 Opened in browser", "info"); }
  }
}

// ── Audit ──────────────────────────────────────────────────────────────────

async function doAudit(name: string, ctx: Ctx): Promise<void> {
  ctx.ui.setStatus?.(`Auditing ${name}...`);
  const report = await auditPackage(name, { deepScan: true });
  cacheAudit(name, report);
  const lines = [
    `${report.risk === "safe" ? "✅" : report.risk === "low" ? "🟢" : report.risk === "moderate" ? "🟡" : "🔴"} Risk: ${report.risk.toUpperCase()}`,
    `Deep scan: ${report.deepScanned ? "yes" : "no"}`,
    "",
    report.findings.length === 0 ? "No issues found." : `${report.findings.length} finding(s):`,
    ...report.findings.slice(0, 20).map(f => `[${f.severity.toUpperCase()}] ${f.reason}${f.file ? ` (${f.file})` : ""}`),
    "↩ Back",
  ];
  await ctx.ui.select(`Audit: ${name}`, lines);
}

// ── Install (audit FIRST, then options) ────────────────────────────────────

async function doInstall(pkg: PackageResult, ctx: Ctx): Promise<void> {
  // Audit first
  ctx.ui.setStatus?.(`Auditing ${pkg.name} before install...`);
  const report = await auditPackage(pkg.name, { deepScan: true });
  cacheAudit(pkg.name, report);

  // Show audit results
  const auditLines = [
    `${report.risk === "safe" ? "✅" : "🔴"} Risk: ${report.risk.toUpperCase()} (${report.findings.length} findings)`,
    ...report.findings.slice(0, 10).map(f => `[${f.severity}] ${f.reason}`),
    "",
    report.risk === "critical" || report.risk === "high" ? "⚠️ High risk — proceed with caution" : "✅ Safe to install",
    "",
  ];

  // Build install options
  const cmds: Array<{ label: string; description: string }> = [];
  const seen = new Set<string>();
  for (const eco of pkg.ecosystems) {
    if ((eco === "pi" || eco === "omp") && !seen.has("pi")) {
      seen.add("pi");
      auditLines.push("🥧 pi install");
      cmds.push({ label: "🥧 pi install", description: `pi install npm:${pkg.name}` });
      cmds.push({ label: "⌥ omp install", description: `omp plugin install npm:${pkg.name}` });
      auditLines.push("⌥ omp install");
    }
    if (eco === "claude" && !seen.has("claude")) { seen.add("claude"); cmds.push({ label: "🤖 claude", description: `claude plugin install npm:${pkg.name}` }); auditLines.push("🤖 claude install"); }
    if (eco === "opencode" && !seen.has("opencode")) { seen.add("opencode"); cmds.push({ label: "🔓 opencode", description: `opencode plugin ${pkg.name}` }); auditLines.push("🔓 opencode install"); }
    if (eco === "gemini" && !seen.has("gemini")) { seen.add("gemini"); cmds.push({ label: "💎 gemini", description: `gemini extension install ${pkg.repository ?? pkg.name}` }); auditLines.push("💎 gemini install"); }
    if (eco === "codex" && !seen.has("codex")) { seen.add("codex"); cmds.push({ label: "🔲 codex", description: `codex plugin add npm:${pkg.name}` }); auditLines.push("🔲 codex install"); }
  }
  if (!seen.has("npm")) { cmds.push({ label: "📦 npm", description: `npm install ${pkg.name}` }); auditLines.push("📦 npm install"); }
  cmds.push({ label: "⚡ bunx", description: `bunx ${pkg.name}` });
  cmds.push({ label: "↩ Cancel", description: "" });

  // High risk confirmation
  if (report.risk === "critical" || report.risk === "high") {
    const proceed = await ctx.ui.confirm(`${report.risk} risk`, `⚠️ ${pkg.name}: ${report.findings.length} security findings. Install anyway?`);
    if (!proceed) { ctx.ui.notify("Cancelled.", "info"); return; }
  }

  const choice = await ctx.ui.select(`Install ${pkg.name} — Audit: ${report.risk}`, cmds);
  if (!choice || choice.includes("Cancel")) return;
  const selected = cmds.find(c => c.label === choice);
  if (!selected) return;
  ctx.ui.notify(`✅ Run:\n  ${selected.description}`, "info");
}

// ── Factory ────────────────────────────────────────────────────────────────

export default function zmarketplace(pi: {
  registerCommand(name: string, def: { description: string; handler: (args: string, ctx: Ctx) => Promise<void> }): void;
  setLabel?(label: string): void;
}) {
  pi.setLabel?.("Z Marketplace");
  pi.registerCommand("zmarketplace", {
    description: "Search, audit, and install packages across agent ecosystems",
    handler: async (rawArgs: string, ctx: Ctx) => {
      const args = parseArgs(rawArgs.trim().split(/\s+/).filter(Boolean));

      switch (args.subcommand) {
        case "help": {
          ctx.ui.notify(formatHelp(), "info");
          break;
        }
        case "audit":
        case "a": {
          const ref = args.positional[0];
          if (!ref) { ctx.ui.notify("Usage: /zmarketplace audit <name>", "info"); break; }
          await doAudit(resolveRef(ref)?.name ?? ref, ctx);
          break;
        }
        case "search":
        case "s":
        case "": {
          let query = args.positional.join(" ").trim();
          let limit = 50;
          if (!query && ctx.hasUI) {
            // Choose result limit
            const limitChoice = await ctx.ui.select("Results limit", ["25", "50", "150", "Unlimited"]);
            limit = limitChoice === "Unlimited" ? 999999 : parseInt(limitChoice ?? "50", 10);
            query = (await ctx.ui.input("🔍 Search packages", "Type search query...")) ?? "";
            if (!query) return;
          }
          await doSearch(query, ctx, limit);
          break;
        }
        default: {
          // Treat unknown as search query
          await doSearch(rawArgs.trim(), ctx);
        }
      }
    },
  });
}
