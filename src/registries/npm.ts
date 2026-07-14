/**
 * npm registry adapter — searches the npm registry by keyword.
 * Covers pi-package, claude-code, opencode, gemini-cli, codex keywords.
 */

import type { Ecosystem, PackageResult, PackageType, RegistrySource } from "../core/types.ts";
import { ECOSYSTEM_KEYWORDS } from "../core/types.ts";

const NPM_SEARCH_URL = "https://registry.npmjs.org/-/v1/search";
const NPM_PACKAGE_URL = "https://registry.npmjs.org";

interface NpmSearchResponse {
  total: number;
  objects: Array<{
    package: {
      name: string;
      version: string;
      description: string;
      keywords?: string[];
      publisher?: { username?: string };
      date?: string;
      links: { npm?: string; repository?: string; homepage?: string };
      scope?: string;
    };
    downloads?: number;
    readme?: string;
  }>;
}

interface NpmPackageMeta {
  "dist-tags": { latest: string };
  description?: string;
  readme?: string;
  versions: Record<string, {
    dependencies?: Record<string, string>;
    dist?: { unpackedSize?: number; fileCount?: number; tarball?: string };
    license?: string;
    repository?: { url?: string } | string;
    homepage?: string;
    keywords?: string[];
    description?: string;
  }>;
  time?: Record<string, string>;
}

/** Detect which ecosystems a package targets based on its keywords. */
export function detectEcosystems(keywords?: string[], name?: string): Ecosystem[] {
  const kws = new Set((keywords ?? []).map(k => k.toLowerCase()));
  const result: Ecosystem[] = [];
  const n = (name ?? "").toLowerCase();

  if (kws.has("pi-package") || n.includes("pi-")) result.push("pi", "omp");
  if (kws.has("claude-code") || kws.has("claude-code-plugin") || kws.has("cc-plugin") || n.includes("claude")) result.push("claude");
  if (kws.has("opencode") || kws.has("opencode-plugin") || n.includes("opencode")) result.push("opencode");
  if (kws.has("gemini-cli") || kws.has("gemini-extension") || kws.has("gemini-cli-extension") || n.includes("gemini")) result.push("gemini");
  if (kws.has("codex") || kws.has("codex-plugin") || kws.has("codex-cli") || n.includes("codex")) result.push("codex");

  if (result.length === 0) result.push("unknown");
  return result;
}

/** Detect the package resource type from keywords and name. */
export function detectType(keywords?: string[], name?: string): PackageType {
  const kws = new Set((keywords ?? []).map(k => k.toLowerCase()));
  const n = (name ?? "").toLowerCase();

  if (kws.has("theme")) return "theme";
  if (kws.has("prompt") || kws.has("prompts") || kws.has("prompt-template")) return "prompt";
  if (kws.has("skill") || kws.has("agent-skill")) return "skill";
  if (kws.has("mcp") || kws.has("mcp-server") || n.includes("mcp")) return "mcp";
  if (kws.has("extension") || kws.has("plugin")) return "extension";
  // Heuristic: pi packages are usually extensions, claude/cc packages are plugins
  if (kws.has("pi-package") || kws.has("opencode")) return "extension";
  if (kws.has("claude-code")) return "plugin";
  return "unknown";
}

/** Generate the appropriate install command for an ecosystem. */
export function installCommandFor(name: string, ecosystem: Ecosystem): string {
  switch (ecosystem) {
    case "pi":
    case "omp": return `pi install npm:${name}`;
    case "claude": return `claude plugin install npm:${name}`;
    case "opencode": return `opencode plugin ${name}`;
    case "gemini": return `gemini extension install npm:${name}`;
    case "codex": return `codex plugin add npm:${name}`;
    default: return `npm install ${name}`;
  }
}

/** Search npm by ecosystem keyword(s). */
export async function searchNpm(
  query: string,
  options: { ecosystems?: Ecosystem[]; type?: PackageType | "all"; limit?: number },
): Promise<PackageResult[]> {
  const limit = options.limit ?? 25;
  const allEcosystems: Ecosystem[] = options.ecosystems && options.ecosystems.length > 0
    ? options.ecosystems
    : ["pi", "claude", "opencode", "gemini", "codex"];

  // Collect unique keywords for the selected ecosystems
  const keywords = new Set<string>();
  for (const eco of allEcosystems) {
    const kws = ECOSYSTEM_KEYWORDS[eco as keyof typeof ECOSYSTEM_KEYWORDS];
    if (kws) for (const k of kws) keywords.add(k);
  }

  // npm search doesn't handle complex OR queries well — query per keyword in parallel.
  const perKeyword = Math.max(5, Math.ceil(limit / keywords.size));
  const q = query.trim();

  const fetches = [...keywords].map(async kw => {
    const searchText = q ? `keywords:${kw} ${q}` : `keywords:${kw}`;
    const url = `${NPM_SEARCH_URL}?text=${encodeURIComponent(searchText)}&size=${perKeyword}`;
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) return [];
      const data = await resp.json() as NpmSearchResponse;
      return data.objects;
    } catch {
      return [];
    }
  });

  const settled = await Promise.all(fetches);
  const objects = settled.flat();

  // Deduplicate by package name
  const seen = new Set<string>();
  const unique = objects.filter(obj => {
    if (seen.has(obj.package.name)) return false;
    seen.add(obj.package.name);
    return true;
  });

  return unique.slice(0, limit).map(obj => {
    const pkg = obj.package;
    const ecosystems = detectEcosystems(pkg.keywords, pkg.name);
    const type = detectType(pkg.keywords, pkg.name);
    return {
      name: pkg.name,
      description: pkg.description ?? "",
      version: pkg.version,
      author: pkg.publisher?.username,
      ecosystems,
      type,
      source: "npm" as RegistrySource,
      homepage: pkg.links.homepage ?? pkg.links.repository,
      npmUrl: pkg.links.npm ?? `https://www.npmjs.com/package/${pkg.name}`,
      repository: pkg.links.repository,
      publishedAt: pkg.date,
      installCommand: installCommandFor(pkg.name, ecosystems[0] ?? "unknown"),
    };
  });
}

/** Fetch full metadata for a specific package. */
export async function getNpmPackageMeta(name: string): Promise<NpmPackageMeta | null> {
  try {
    const resp = await fetch(`${NPM_PACKAGE_URL}/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;
    return await resp.json() as NpmPackageMeta;
  } catch {
    return null;
  }
}
