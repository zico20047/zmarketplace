/**
 * Gemini CLI extensions adapter — fetches the community-maintained extensions registry.
 * Source: geminicli.com/extensions.json (~12,000+ extensions crawled from GitHub topics).
 */

import type { PackageResult, PackageType, RegistrySource } from "../core/types.ts";

const GEMINI_REGISTRY_URL = "https://geminicli.com/extensions.json";

interface GeminiExtension {
  id?: string;
  url?: string;
  fullName?: string;
  repoDescription?: string;
  stars?: number;
  extensionName?: string;
  extensionVersion?: string;
  extensionDescription?: string;
  avatarUrl?: string;
  hasMCP?: boolean;
  hasContext?: boolean;
  hasHooks?: boolean;
  hasSkills?: boolean;
  hasCustomCommands?: boolean;
  isGoogleOwned?: boolean;
  licenseKey?: string;
  lastUpdated?: string;
}

let cachedExtensions: GeminiExtension[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Fetch the full Gemini extensions registry (cached for 5 min). */
async function getRegistry(): Promise<GeminiExtension[]> {
  const now = Date.now();
  if (cachedExtensions && now - cacheTime < CACHE_TTL_MS) return cachedExtensions;

  try {
    const resp = await fetch(GEMINI_REGISTRY_URL, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return cachedExtensions ?? [];
    const data = await resp.json();
    cachedExtensions = Array.isArray(data) ? data : [];
    cacheTime = now;
    return cachedExtensions;
  } catch {
    return cachedExtensions ?? [];
  }
}

/** Determine the package type from Gemini extension flags. */
function geminiType(ext: GeminiExtension): PackageType {
  if (ext.hasMCP) return "mcp";
  if (ext.hasSkills) return "skill";
  return "extension";
}

/** Search the Gemini CLI extensions registry. */
export async function searchGeminiExtensions(query: string, limit = 25): Promise<PackageResult[]> {
  const extensions = await getRegistry();
  const q = query.toLowerCase().trim();

  const matched = q
    ? extensions.filter(ext => {
        const name = (ext.extensionName ?? ext.id ?? "").toLowerCase();
        const desc = (ext.extensionDescription ?? ext.repoDescription ?? "").toLowerCase();
        return name.includes(q) || desc.includes(q);
      })
    : extensions;

  return matched.slice(0, limit).map(ext => {
    const repoUrl = ext.url ?? `https://github.com/${ext.fullName ?? ""}`;
    return {
      name: ext.extensionName ?? ext.id ?? ext.fullName ?? "unknown",
      description: ext.extensionDescription ?? ext.repoDescription ?? "",
      version: ext.extensionVersion,
      author: ext.fullName?.split("/")[0],
      ecosystems: ["gemini"],
      type: geminiType(ext),
      source: "gemini-extensions" as RegistrySource,
      homepage: repoUrl,
      repository: repoUrl,
      publishedAt: ext.lastUpdated,
      installCommand: ext.url
        ? `gemini extension install ${ext.url}`
        : "gemini extension install <github-url>",
    };
  });
}
