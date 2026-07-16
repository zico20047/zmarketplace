/**
 * Install dispatcher — runs the correct install command for the detected agent.
 * Always runs an audit first and requires explicit confirmation.
 */

import type { InstallResult, InstallTarget, AuditReport } from "./types.ts";
import { auditPackage } from "./audit.ts";
import { getNpmPackageMeta } from "../registries/npm.ts";

/** Which agent are we running inside? Detected by probing globals/env. */
export function detectAgent(): InstallTarget {
  const env = globalThis.process?.env ?? {};
  // Pi/omp sets these
  if (env["OMP_VERSION"]) return "omp";
  if (env["PI_VERSION"]) return "pi";
  // Claude Code sets this
  if (env["CLAUDE_CODE"] || env["CLAUDE"]) return "claude";
  // OpenCode
  if (env["OPENCODE"]) return "opencode";
  // Gemini CLI
  if (env["GEMINI_CLI"]) return "gemini";
  // Codex
  if (env["CODEX"]) return "codex";
  return "auto";
}

/** Build the install command for a given target. */
function buildCommand(packageName: string, target: InstallTarget): string {
  switch (target) {
    case "pi": return `pi install npm:${packageName}`;
    case "omp": return `omp plugin install npm:${packageName}`;
    case "claude": return `claude plugin install npm:${packageName}`;
    case "opencode": return `opencode plugin ${packageName}`;
    case "gemini": return `gemini extension install npm:${packageName}`;
    case "npm":
    case "auto": // 'auto' resolves to npm as fallback — actual resolution happens in resolveAutoTarget
    default: return `npm install ${packageName}`;
  }
}

/** Resolve a "auto" target by checking package keywords. */
async function resolveAutoTarget(packageName: string): Promise<InstallTarget> {
  const meta = await getNpmPackageMeta(packageName);
  if (!meta) return "auto";
  const latest = meta["dist-tags"]?.latest;
  if (!latest) return "auto";
  const version = meta.versions[latest];
  const kws = new Set((version?.keywords ?? []).map((k: string) => k.toLowerCase()));
  if (kws.has("pi-package")) return "pi";
  if (kws.has("claude-code")) return "claude";
  if (kws.has("opencode")) return "opencode";
  if (kws.has("gemini-cli")) return "gemini";
  if (kws.has("codex")) return "codex";
  if (kws.has("npm") || kws.has("bun") || kws.has("nodejs")) return "npm";
  return "auto";
}

export interface InstallOptions {
  /** Force the install target instead of auto-detecting. */
  target?: InstallTarget;
  /** Skip the pre-install audit. Default false. */
  skipAudit?: boolean;
  /** Callback for audit-before-confirmation flow. Returns true to proceed. */
  confirm?: (report: AuditReport | null) => boolean;
}

/**
 * Install a package: audit → confirm → run command.
 * Never auto-installs. Returns the command and result.
 */
export async function installPackage(
  packageName: string,
  options: InstallOptions = {},
): Promise<InstallResult> {
  // Step 1: Audit (unless skipped)
  let report: AuditReport | null = null;
  if (!options.skipAudit) {
    report = await auditPackage(packageName, { deepScan: true });
  }

  // Step 2: Confirm
  if (options.confirm && !options.confirm(report)) {
    return {
      packageName,
      target: options.target ?? "auto",
      command: "",
      success: false,
      message: "Installation cancelled by user.",
    };
  }

  // Step 3: Resolve target
  let target = options.target ?? detectAgent();
  if (target === "auto") {
    target = await resolveAutoTarget(packageName);
  }

  // Step 4: Build and return the command (do not execute — the agent/user runs it)
  const command = buildCommand(packageName, target);

  const riskNote = report && report.risk !== "safe"
    ? ` ⚠️ Audit risk: ${report.risk.toUpperCase()}`
    : "";

  return {
    packageName,
    target,
    command,
    success: true,
    message: `Ready to install. Run:\n  ${command}${riskNote}`,
  };
}
