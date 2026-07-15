/**
 * GitHub topics adapter — searches GitHub repos by topic for agent plugins.
 * Uses the public GitHub search API (60 requests/hour without auth).
 */

import type { PackageResult, PackageType, RegistrySource } from "../core/types.ts";

const GITHUB_SEARCH = "https://api.github.com/search/repositories";

const AGENT_TOPICS = [
  "claude-code", "agent-plugin", "mcp-server",
  "gemini-cli-extension", "codex-plugin", "pi-package",
];

interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  pushed_at: string;
  owner: { login: string };
  topics: string[];
  license: { key: string } | null;
}

interface GitHubResponse {
  total_count: number;
  items: GitHubRepo[];
}

/** Search GitHub repos by agent-related topics. */
export async function searchGitHubTopics(query: string, limit = 25): Promise<PackageResult[]> {
  const q = query.trim();
  const topicQuery = AGENT_TOPICS.map(t => `topic:${t}`).join(" ");
  const searchText = q ? `${topicQuery} ${q}` : topicQuery;
  const url = `${GITHUB_SEARCH}?q=${encodeURIComponent(searchText)}&sort=stars&order=desc&per_page=${limit}`;

  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "Accept": "application/vnd.github+json" },
    });
    if (!resp.ok) return [];
    const data = await resp.json() as GitHubResponse;

    return (data.items ?? []).slice(0, limit).map(repo => ({
      name: repo.full_name,
      description: repo.description ?? "",
      author: repo.owner.login,
      ecosystems: ["universal"] as const,
      type: "plugin" as PackageType,
      source: "github" as RegistrySource,
      homepage: repo.html_url,
      repository: repo.html_url,
      license: repo.license?.key,
      publishedAt: repo.pushed_at,
      installCommand: `git clone ${repo.html_url}`,
    }));
  } catch {
    return [];
  }
}
