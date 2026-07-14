/**
 * Security audit — two-layer scan of a package before installation.
 * Layer 1: metadata check (zero cost).
 * Layer 2: source code scan (downloads tarball, scans for dangerous patterns).
 */

import type { AuditReport, AuditFinding, AuditSeverity } from "./types.ts";
import { getNpmPackageMeta } from "../registries/npm.ts";

// Danger patterns ordered by severity.
const CRITICAL_PATTERNS: Array<[RegExp, string]> = [
  [/rm\s+-rf/i, "Recursive forced deletion command"],
  [/\brimraf\b/i, "Recursive directory deletion library"],
  [/fs\.unlink(Sync)?\s*\(/g, "File deletion"],
  [/fs\.rmdir(Sync)?\s*\(/g, "Directory deletion"],
  [/fs\.rm(Sync)?\s*\(/g, "File/directory removal"],
];

const HIGH_PATTERNS: Array<[RegExp, string]> = [
  [/\beval\s*\(/g, "Dynamic code execution via eval()"],
  [/\bnew\s+Function\s*\(/g, "Dynamic code execution via Function()"],
  [/execSync\s*\(/g, "Synchronous command execution"],
  [/execFile(Sync)?\s*\(/g, "Child process execution"],
  [/\bspawn(Sync)?\s*\(/g, "Process spawning"],
];

const MEDIUM_PATTERNS: Array<[RegExp, string]> = [
  [/process\.env\b/g, "Environment variable access"],
  [/child_process/g, "Child process module import"],
  [/\bfetch\s*\(/g, "HTTP fetch call"],
  [/\bXMLHttpRequest\b/g, "HTTP request"],
  [/https?:\/\/[^'")\s]+/g, "Hardcoded URL"],
];

const LOW_PATTERNS: Array<[RegExp, string]> = [
  [/fs\.chmod(Sync)?\s*\(/g, "File permission change"],
  [/fs\.chown(Sync)?\s*\(/g, "File ownership change"],
];

const ALL_PATTERN_LAYERS: Array<[AuditSeverity, Array<[RegExp, string]>]> = [
  ["critical", CRITICAL_PATTERNS],
  ["high", HIGH_PATTERNS],
  ["medium", MEDIUM_PATTERNS],
  ["low", LOW_PATTERNS],
];

const SEVERITY_WEIGHT: Record<AuditSeverity, number> = {
  critical: 100,
  high: 25,
  medium: 5,
  low: 1,
  info: 0,
};

const SCANABLE_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".cjs", ".tsx", ".jsx"]);

/** Scan a source file string for dangerous patterns. */
function scanSource(content: string, fileName: string): AuditFinding[] {
  const lines = content.split("\n");
  const findings: AuditFinding[] = [];

  for (const [severity, patterns] of ALL_PATTERN_LAYERS) {
    for (const [regex, reason] of patterns) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        // Find line number for the match offset
        const offset = match.index;
        const before = content.slice(0, offset);
        const lineNum = before.split("\n").length;
        const lineText = lines[lineNum - 1]?.trim() ?? "";

        findings.push({
          severity,
          pattern: match[0],
          file: fileName,
          line: lineNum,
          excerpt: lineText.slice(0, 200),
          reason,
        });
      }
    }
  }

  return findings;
}

/** Compute overall risk from findings. */
function computeRisk(findings: AuditFinding[]): AuditReport["risk"] {
  const score = findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
  if (score >= 100) return "critical";
  if (score >= 50) return "high";
  if (score >= 15) return "moderate";
  if (score >= 5) return "low";
  return "safe";
}

/** Run a full audit on a package. */
export async function auditPackage(
  packageName: string,
  options: { deepScan?: boolean } = {},
): Promise<AuditReport> {
  const deepScan = options.deepScan ?? true;
  const meta = await getNpmPackageMeta(packageName);
  const latestVersion = meta?.["dist-tags"]?.latest;

  // Layer 1: Metadata check
  const metadataFindings: AuditFinding[] = [];
  if (meta && latestVersion) {
    const versionData = meta.versions[latestVersion];
    const depCount = Object.keys(versionData?.dependencies ?? {}).length;
    const size = versionData?.dist?.unpackedSize ?? 0;
    const fileCount = versionData?.dist?.fileCount ?? 0;

    if (depCount > 20) {
      metadataFindings.push({
        severity: "medium",
        pattern: `${depCount} dependencies`,
        reason: "High dependency count increases supply chain risk",
      });
    }
    if (size > 10 * 1024 * 1024) {
      metadataFindings.push({
        severity: "low",
        pattern: `${(size / 1024 / 1024).toFixed(1)} MB`,
        reason: "Large package size",
      });
    }
    if (fileCount > 500) {
      metadataFindings.push({
        severity: "low",
        pattern: `${fileCount} files`,
        reason: "Large file count",
      });
    }
    if (!versionData?.license) {
      metadataFindings.push({
        severity: "low",
        pattern: "no license",
        reason: "No license declared — usage rights unclear",
      });
    }
  }

  // Layer 2: Source scan
  let sourceFindings: AuditFinding[] = [];

  if (deepScan && latestVersion) {
    try {
      const tarballUrl = meta?.versions[latestVersion]?.dist?.tarball;
      if (tarballUrl) {
        const resp = await fetch(tarballUrl);
        if (resp.ok) {
          const tarball = new Uint8Array(await resp.arrayBuffer());
          const files = extractTextFilesFromTar(tarball);
          sourceFindings = files.flatMap(({ name, content }) => scanSource(content, name));
        }
      }
    } catch {
      sourceFindings.push({
        severity: "info",
        pattern: "scan failed",
        reason: "Could not download or extract tarball for source scanning",
      });
    }
  }

  const allFindings = [...metadataFindings, ...sourceFindings];
  const risk = computeRisk(allFindings);

  const summaryParts: string[] = [];
  const counts: Partial<Record<AuditSeverity, number>> = {};
  for (const f of allFindings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  const order: AuditSeverity[] = ["critical", "high", "medium", "low", "info"];
  for (const sev of order) {
    if (counts[sev]) summaryParts.push(`${counts[sev]} ${sev}`);
  }

  return {
    packageName,
    version: latestVersion,
    risk,
    metadataFindings,
    sourceFindings,
    findings: allFindings,
    deepScanned: deepScan,
    summary: `Risk: ${risk.toUpperCase()}. Findings: ${summaryParts.join(", ") || "none"}. ${deepScan ? "Source scanned." : "Metadata only."}`,
  };
}

/**
 * Minimal tar text-file extractor. Bun can handle .tar natively,
 * but we do a pure-JS fallback to avoid loading heavy deps for large tarballs.
 * Extracts only text files (.ts/.js/.mjs/.cjs/.tsx/.jsx).
 */
function extractTextFilesFromTar(tarball: Uint8Array): Array<{ name: string; content: string }> {
  const results: Array<{ name: string; content: string }> = [];
  const decoder = new TextDecoder("utf-8", { fatal: false });

  let offset = 0;
  while (offset + 512 <= tarball.length) {
    // Read header block (512 bytes)
    const header = tarball.subarray(offset, offset + 512);

    // Check for end-of-archive (two zero blocks)
    if (header.every(b => b === 0)) break;

    // Parse name (offset 0, 100 bytes)
    const name = decoder.decode(header.subarray(0, 100)).replace(/\0/g, "").trim();

    // Parse size (offset 124, 12 bytes, octal)
    const sizeStr = decoder.decode(header.subarray(124, 136)).replace(/\0/g, "").trim();
    const size = sizeStr ? parseInt(sizeStr, 8) : 0;

    // Parse type flag (offset 156, 1 byte) — '0' or '\0' = regular file
    const typeFlag = String.fromCharCode(header[156] ?? 0);

    offset += 512;

    if ((typeFlag === "0" || typeFlag === "\0") && size > 0) {
      // Check if it's a scanable file
      const ext = name.substring(name.lastIndexOf("."));
      if (SCANABLE_EXTENSIONS.has(ext)) {
        const fileContent = tarball.subarray(offset, offset + size);
        results.push({
          name,
          content: decoder.decode(fileContent),
        });
      }
    }

    // Advance past file data (padded to 512-byte boundary)
    offset += Math.ceil(size / 512) * 512;
  }

  return results;
}
