/**
 * TUI display layer — formatting helpers for search results, detail cards,
 * audit reports, and interactive option builders.
 *
 * Uses Unicode icons + box-drawing for terminal rendering.
 */

import type { PackageResult, PackageDetail, AuditReport, Ecosystem, PackageType, AuditSeverity } from "./types.ts";

const TYPE_ICON: Record<PackageType, string> = {
  extension: "🔧",
  skill: "⭐",
  theme: "🎨",
  prompt: "📝",
  plugin: "📦",
  mcp: "🔌",
  unknown: "❓",
};

const ECO_LABEL: Record<Ecosystem, string> = {
  pi: "pi",
  omp: "omp",
  claude: "claude",
  opencode: "opencode",
  gemini: "gemini",
  codex: "codex",
  npm: "npm",
  universal: "universal",
  unknown: "?",
};

const SEVERITY_ICON: Record<AuditSeverity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🟢",
  info: "ℹ️",
};

const RISK_ICON: Record<AuditReport["risk"], string> = {
  safe: "✅",
  low: "🟢",
  moderate: "🟡",
  high: "🟠",
  critical: "🔴",
};

/** Format a single result as a one-line select option. */
export function formatResultOption(result: PackageResult, index: number): { label: string; value: string } {
  const icon = TYPE_ICON[result.type] ?? "📦";
  const eco = result.ecosystems
    .filter(e => e !== "unknown")
    .map(e => ECO_LABEL[e])
    .join(",");
  const desc = result.description.length > 70
    ? result.description.slice(0, 67) + "..."
    : result.description;
  const ver = result.version ? ` v${result.version}` : "";
  return {
    label: `${icon} [${index + 1}] ${result.name}${ver} (${eco}) — ${desc}`,
    value: String(index),
  };
}

/** Format results for ctx.ui.select(). */
export function buildSelectOptions(results: PackageResult[]): Array<{ label: string; value: string }> {
  return results.map((r, i) => formatResultOption(r, i));
}

/** Format a detailed package card. */
export function formatDetailCard(detail: PackageDetail): string {
  const icon = TYPE_ICON[detail.type] ?? "📦";
  const eco = detail.ecosystems.filter(e => e !== "unknown").map(e => ECO_LABEL[e]).join(", ") || "npm";
  const lines: string[] = [
    `━━━ ${icon} ${detail.name} v${detail.version ?? "?"} [${eco}] ━━━`,
    "",
  ];

  if (detail.description) lines.push(`  ${detail.description}`);
  lines.push("");
  if (detail.license) lines.push(`  License:      ${detail.license}`);
  if (detail.dependencyCount !== undefined) lines.push(`  Dependencies: ${detail.dependencyCount}`);
  if (detail.size) lines.push(`  Size:         ${(detail.size / 1024).toFixed(1)} KB`);
  if (detail.fileCount) lines.push(`  Files:        ${detail.fileCount}`);
  if (detail.publishedAt) lines.push(`  Published:    ${detail.publishedAt.slice(0, 10)}`);
  if (detail.npmUrl) lines.push(`  npm:          ${detail.npmUrl}`);
  if (detail.repository) lines.push(`  Repository:   ${detail.repository}`);

  lines.push("");
  if (detail.installCommand) lines.push(`  ▶ Install: ${detail.installCommand}`);

  return lines.join("\n");
}

/** Format an audit report for display. */
export function formatAuditReport(report: AuditReport): string {
  const riskIcon = RISK_ICON[report.risk];
  const lines: string[] = [
    `${riskIcon} Security Audit: ${report.packageName} v${report.version ?? "?"}`,
    `   Risk: ${report.risk.toUpperCase()}`,
    `   Deep scan: ${report.deepScanned ? "yes (source code scanned)" : "no (metadata only)"}`,
    "",
  ];

  if (report.findings.length === 0) {
    lines.push("   ✅ No security issues found.");
  } else {
    lines.push(`   ${report.findings.length} finding(s):`);
    for (const f of report.findings.slice(0, 20)) {
      const icon = SEVERITY_ICON[f.severity];
      const loc = f.file ? ` ${f.file}${f.line ? `:${f.line}` : ""}` : "";
      lines.push(`   ${icon} [${f.severity.toUpperCase()}] ${f.reason}${loc}`);
    }
    if (report.findings.length > 20) {
      lines.push(`   ... and ${report.findings.length - 20} more`);
    }
  }

  return lines.join("\n");
}

/** Format a help message for /zmarketplace with no args. */
export function formatHelp(): string {
  return [
    "📦 zmarketplace — cross-agent package search",
    "",
    "Usage:",
    "  /zmarketplace search <query>     Search across all registries",
    "  /zmarketplace detail <id|name>   Show package details",
    "  /zmarketplace audit <id|name>    Run security audit",
    "  /zmarketplace install <id|name>  Audit + install a package",
    "",
    "Options for 'search':",
    "  --type=<type>        Filter: extension, skill, theme, prompt, plugin, mcp",
    "  --eco=<ecosystem>    Filter: pi, claude, opencode, gemini, codex, npm",
    "  --limit=<n>          Max results (default 20)",
    "",
    "Registries: npm + Claude marketplace + Gemini extensions + MCP registry",
    "",
    "Examples:",
    "  /zmarketplace search mcp",
    "  /zmarketplace search subagent --eco=pi",
    "  /zmarketplace install 3",
    "  /zmarketplace audit pi-mcp-adapter",
  ].join("\n");
}

/** Parse CLI-style args from the command input. */
export interface ParsedArgs {
  subcommand: string;
  positional: string[];
  flags: Record<string, string>;
}

export function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  let subcommand = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        flags[arg.slice(2)] = "true";
      }
    } else if (!subcommand) {
      subcommand = arg;
    } else {
      positional.push(arg);
    }
  }

  return { subcommand, positional, flags };
}
