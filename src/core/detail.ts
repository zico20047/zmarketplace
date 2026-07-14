/**
 * Package detail fetcher — retrieves full metadata, README, and manifest info.
 */

import type { PackageDetail } from "./types.ts";
import { getNpmPackageMeta } from "../registries/npm.ts";

/** Fetch detailed package information from npm + any available manifests. */
export async function getDetail(packageName: string): Promise<PackageDetail | null> {
  const meta = await getNpmPackageMeta(packageName);
  if (!meta) return null;

  const latestVersion = meta["dist-tags"]?.latest;
  if (!latestVersion) return null;

  const versionData = meta.versions[latestVersion];
  if (!versionData) return null;

  const repoUrl = typeof versionData.repository === "string"
    ? versionData.repository
    : versionData.repository?.url;

  const dependencies = versionData.dependencies ?? {};
  const depCount = Object.keys(dependencies).length;

  return {
    name: packageName,
    description: meta.description ?? versionData.description ?? "",
    version: latestVersion,
    source: "npm",
    ecosystems: [],
    type: "unknown",
    readme: meta.readme,
    dependencyCount: depCount,
    size: versionData.dist?.unpackedSize,
    fileCount: versionData.dist?.fileCount,
    license: versionData.license,
    homepage: versionData.homepage ?? repoUrl,
    repository: repoUrl,
    npmUrl: `https://www.npmjs.com/package/${packageName}`,
    keywords: versionData.keywords ?? [],
    publishedAt: meta.time?.[latestVersion],
  };
}
