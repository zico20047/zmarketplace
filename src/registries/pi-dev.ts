/**
 * pi-dev registry adapter — placeholder.
 *
 * No public pi-dev registry URL exists yet, so this returns empty results.
 * When a pi-dev registry becomes available, implement the fetch here.
 */

import type { PackageResult } from "../core/types.ts";

/** Search the pi-dev registry. Not yet available — returns empty. */
export async function searchPiDev(_query: string, _limit = 25): Promise<PackageResult[]> {
  return [];
}
