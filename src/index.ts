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
import { spawn } from "node:child_process";

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
  const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
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

const PAGE_SIZE = 50;

async function browseResults(results: PackageResult[], ctx: Ctx): Promise<void> {
  let pageStart = 0;
  while (true) {
    const pageEnd = Math.min(pageStart + PAGE_SIZE, results.length);
    const page = results.slice(pageStart, pageEnd);

    const options: string[] = page.map((r, i) => formatResultOption(r, pageStart + i).label);

    if (pageStart > 0) {
      const ps = Math.max(0, pageStart - PAGE_SIZE) + 1;
      options.push(`← Previous (${ps}-${pageStart})`);
    }
    if (pageEnd < results.length) {
      options.push(`→ Next (${pageEnd + 1}-${Math.min(pageEnd + PAGE_SIZE, results.length)})`);
    }
    options.push("↩ Done");

    const title = `zmarketplace: ${results.length} results (page ${Math.floor(pageStart / PAGE_SIZE) + 1}/${Math.ceil(results.length / PAGE_SIZE)})`;
    const selected = await ctx.ui.select(title, options);

    if (!selected || selected === "↩ Done") return;
    if (selected.startsWith("← Previous")) { pageStart = Math.max(0, pageStart - PAGE_SIZE); continue; }
    if (selected.startsWith("→ Next")) { pageStart += PAGE_SIZE; continue; }

    const match = selected.match(/\[(\d+)\]/);
    if (match) {
      const pkg = results[parseInt(match[1], 10) - 1];
      if (pkg) await packageDetail(pkg, ctx);
    }
  }
}

// ── Detail + README ────────────────────────────────────────────────────────

async function packageDetail(pkg: PackageResult, ctx: Ctx): Promise<void> {
  ctx.ui.setStatus?.(`Loading ${pkg.name}...`);
  const detail = await getDetail(pkg.name);
  if (!detail) { ctx.ui.notify(`"${pkg.name}" not found.`, "warning"); return; }

  const repoBase = detail.repository?.replace(/^git\+/, "").replace(/\.git$/, "");
  const lines: string[] = [
    "⬇ Install (audit first)",
    "🔒 Audit only",
    "↩ Back to results",
    `📦 ${detail.name} v${detail.version ?? "?"} — ${detail.license ?? "?"} · ${detail.dependencyCount ?? "?"} deps · ${detail.size ? (detail.size / 1024).toFixed(0) + "KB" : "?"}`,
    detail.description || "",
  ];
  if (detail.npmUrl) lines.push(`🔗 ${detail.npmUrl}`);
  if (repoBase) lines.push(`🔗 ${repoBase}`);

  if (detail.readme) {
    lines.push("━━━ README (40 lines — enter on 🔗 to open) ━━━");
    const rl = detail.readme
      .replace(/!\[.*?\]\((https?:\/\/[^)]+)\)/g, "\n🖼 $1\n")
      .replace(/!\[.*?\]\(([^)]+)\)/g, (_m, p) => `\n🖼 ${repoBase ? repoBase + "/raw/main/" + p.replace(/^\.\//, "") : p}\n`)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 → $2")
      .replace(/<[^>]+>/g, "")
      .split("\n").map(l => l.trimEnd()).filter(l => l.length > 0)
      .slice(0, 40);
    lines.push(...rl);
    lines.push("...(see npm for full README)");
  }

  while (true) {
    const selected = await ctx.ui.select(`${detail.name} — Details`, lines);
    if (!selected) continue;
    if (selected.includes("Back to results")) return;
    if (selected.includes("Install")) {
      const cmd = await doInstall(pkg, ctx);
      if (cmd) lines.push(`✅ Run: ${cmd}`);  // show command at BOTTOM
      continue;
    }
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

async function doInstall(pkg: PackageResult, ctx: Ctx): Promise<string | null> {
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

  // Build install options as plain strings
  const cmds: string[] = [];
  const cmdMap = new Map<string, string>();
  const seen = new Set<string>();
  const addCmd = (label: string, command: string) => { cmds.push(label); cmdMap.set(label, command); };

  for (const eco of pkg.ecosystems) {
    if ((eco === "pi" || eco === "omp") && !seen.has("pi")) {
      seen.add("pi");
      addCmd("🥧 pi install", `pi install npm:${pkg.name}`);
      addCmd("⌥ omp install", `omp plugin install npm:${pkg.name}`);
    }
    if (eco === "claude" && !seen.has("claude")) { seen.add("claude"); addCmd("🤖 claude", `claude plugin install npm:${pkg.name}`); }
    if (eco === "opencode" && !seen.has("opencode")) { seen.add("opencode"); addCmd("🔓 opencode", `opencode plugin ${pkg.name}`); }
    if (eco === "gemini" && !seen.has("gemini")) { seen.add("gemini"); addCmd("💎 gemini", `gemini extension install ${pkg.repository ?? pkg.name}`); }
    if (eco === "codex" && !seen.has("codex")) { seen.add("codex"); addCmd("🔲 codex", `codex plugin add npm:${pkg.name}`); }
    if (eco === "npm" && !seen.has("npm")) {
      seen.add("npm");
      addCmd("📦 npm", `npm install ${pkg.name}`);
      addCmd("🟤 bun add", `bun add ${pkg.name}`);
      addCmd("📦 pnpm add", `pnpm add ${pkg.name}`);
    }
  }
  if (!seen.has("npm")) addCmd("📦 npm", `npm install ${pkg.name}`);
  addCmd("⚡ bunx", `bunx ${pkg.name}`);
  cmds.push("↩ Cancel");

  // High risk confirmation
  if (report.risk === "critical" || report.risk === "high") {
    const proceed = await ctx.ui.confirm(`${report.risk} risk`, `⚠️ ${pkg.name}: ${report.findings.length} security findings. Install anyway?`);
    if (!proceed) { ctx.ui.notify("Cancelled.", "info"); return null; }
  }

  const choice = await ctx.ui.select(`Install ${pkg.name} — Risk: ${report.risk}`, cmds);
  if (!choice || choice === "↩ Cancel") return null;
  const command = cmdMap.get(choice);
  if (command) ctx.ui.notify(`✅ Run:\n  ${command}`, "info");
  return command ?? null;
}

// ── Factory ────────────────────────────────────────────────────────────────

// Command handler — extracted so it can be registered at the right time.
const commandDef = {
  description: "Search, audit, and install packages across agent ecosystems",
  handler: async (rawArgs: string, ctx: Ctx) => {
    const args = parseArgs(rawArgs.trim().split(/\s+/).filter(Boolean));
    switch (args.subcommand) {
      case "help": { ctx.ui.notify(formatHelp(), "info"); break; }
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
          const limitChoice = await ctx.ui.select("Results limit (50 per page)", ["25", "50", "150", "All (paged)"]);
          limit = limitChoice?.startsWith("All") ? 999999 : parseInt(limitChoice ?? "50", 10);
          query = (await ctx.ui.input("Search packages", "Type search query...")) ?? "";
          if (!query) return;
        }
        await doSearch(query, ctx, limit);
        break;
      }
      default: { await doSearch(rawArgs.trim(), ctx); }
    }
  },
} as const;

export default function zmarketplace(pi: {
  registerCommand?(name: string, def: { description: string; handler: (args: string, ctx: Ctx) => Promise<void> }): void;
}) {
  pi.registerCommand?.("zmarketplace", commandDef);
}
