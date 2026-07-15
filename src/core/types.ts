/**
 * Core types for zmarketplace — unified package model across all registries.
 */

/** Which agent ecosystem a package targets. */
export type Ecosystem = "pi" | "omp" | "claude" | "opencode" | "gemini" | "codex" | "npm" | "universal" | "unknown";

/** Package resource type. */
export type PackageType = "extension" | "skill" | "theme" | "prompt" | "plugin" | "mcp" | "unknown";

/** Which registry a result came from. */
export type RegistrySource = "npm" | "claude-marketplace" | "gemini-extensions" | "pi-dev" | "mcp-registry" | "smithery" | "github";

/** A normalized search result — the common currency across all registries. */
export interface PackageResult {
  /** Canonical package name (npm name, or marketplace entry name). */
  name: string;
  /** Short description. */
  description: string;
  /** Semantic version if known. */
  version?: string;
  /** Author display name or handle. */
  author?: string;
  /** Which ecosystems this package targets. */
  ecosystems: Ecosystem[];
  /** Resource type. */
  type: PackageType;
  /** Which registry surfaced this result. */
  source: RegistrySource;
  /** Homepage or repository URL. */
  homepage?: string;
  /** npm registry URL. */
  npmUrl?: string;
  /** Repository URL. */
  repository?: string;
  /** Download counts if available (monthly). */
  downloads?: number;
  /** Last published date (ISO string). */
  publishedAt?: string;
  /** License. */
  license?: string;
  /** Install command string for the detected/queried ecosystem. */
  installCommand?: string;
}

/** Options for a search operation. */
export interface SearchOptions {
  query: string;
  /** Filter by resource type. */
  type?: PackageType | "all";
  /** Filter by ecosystem. */
  ecosystem?: Ecosystem | "all";
  /** Filter by specific registry. */
  registry?: RegistrySource | "all";
  /** Max results total. Default 20. */
  limit?: number;
}

/** Detailed package info — richer than PackageResult. */
export interface PackageDetail extends PackageResult {
  /** Full README or long description. */
  readme?: string;
  /** Dependencies count. */
  dependencyCount?: number;
  /** Unpacked size in bytes. */
  size?: number;
  /** File count in the tarball. */
  fileCount?: number;
  /** Keywords from npm. */
  keywords?: string[];
  /** Pi/omp manifest if present. */
  piManifest?: Record<string, unknown>;
  /** Claude plugin manifest if present. */
  claudeManifest?: Record<string, unknown>;
  /** Gemini extension manifest if present. */
  geminiManifest?: Record<string, unknown>;
}

/** Severity for audit findings. */
export type AuditSeverity = "critical" | "high" | "medium" | "low" | "info";

/** A single security finding from the audit. */
export interface AuditFinding {
  severity: AuditSeverity;
  /** Pattern that was matched. */
  pattern: string;
  /** File where the match was found. */
  file?: string;
  /** Line number. */
  line?: number;
  /** Excerpt of the matching code. */
  excerpt?: string;
  /** Explanation of why this is flagged. */
  reason: string;
}

/** Result of a security audit. */
export interface AuditReport {
  packageName: string;
  version?: string;
  /** Overall risk rating. */
  risk: "safe" | "low" | "moderate" | "high" | "critical";
  /** Metadata-based findings (Layer 1 — zero cost). */
  metadataFindings: AuditFinding[];
  /** Source-scan findings (Layer 2 — requires tarball download). */
  sourceFindings: AuditFinding[];
  /** All findings combined. */
  findings: AuditFinding[];
  /** Whether a deep source scan was performed. */
  deepScanned: boolean;
  /** Summary text for display. */
  summary: string;
}

/** Install target — which agent's install command to use. */
export type InstallTarget = "pi" | "omp" | "claude" | "opencode" | "gemini" | "codex" | "npm" | "auto";

/** Result of an install operation. */
export interface InstallResult {
  packageName: string;
  target: InstallTarget;
  command: string;
  success: boolean;
  message: string;
}

/** Keywords that mark packages for each ecosystem on npm. */
export const ECOSYSTEM_KEYWORDS: Record<Exclude<Ecosystem, "unknown" | "universal">, string[]> = {
  pi: ["pi-package"],
  omp: ["pi-package"],
  claude: ["claude-code", "claude-code-plugin", "cc-plugin"],
  opencode: ["opencode", "opencode-plugin"],
  gemini: ["gemini-cli", "gemini-extension", "gemini-cli-extension"],
  codex: ["codex", "codex-plugin", "codex-cli"],
  npm: ["npm", "bun", "pnpm", "yarn", "nodejs", "deno"],
};
