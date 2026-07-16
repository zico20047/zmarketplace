/**
 * Persistent search history — saves searches to ~/.zmarketplace/history.json.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface HistoryEntry {
  query: string;
  timestamp: string;
  resultCount: number;
  topResults: Array<{ name: string; description: string; source: string }>;
}

const HISTORY_DIR = join(homedir(), ".zmarketplace");
const HISTORY_FILE = join(HISTORY_DIR, "history.json");
const MAX_ENTRIES = 100;

function loadHistory(): HistoryEntry[] {
  try {
    if (existsSync(HISTORY_FILE)) {
      const parsed = JSON.parse(readFileSync(HISTORY_FILE, "utf8"));
      return Array.isArray(parsed) ? parsed as HistoryEntry[] : [];
    }
  } catch { /* ignore corrupt file */ }
  return [];
}

function saveHistory(entries: HistoryEntry[]): void {
  try {
    if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });
    // Backup corrupt file if it exists and is invalid
    if (existsSync(HISTORY_FILE)) {
      try {
        const raw = readFileSync(HISTORY_FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          writeFileSync(HISTORY_FILE + ".corrupt." + Date.now(), raw);
        }
      } catch { /* file is corrupt, will be overwritten */ }
    }
    const tmp = HISTORY_FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify(entries.slice(0, MAX_ENTRIES), null, 2));
    renameSync(tmp, HISTORY_FILE);
  } catch { /* best effort */ }
}

/** Record a search to history. */
export function recordSearch(query: string, results: Array<{ name: string; description: string; source: string }>): void {
  const entries = loadHistory();
  entries.unshift({
    query,
    timestamp: new Date().toISOString(),
    resultCount: results.length,
    topResults: results.slice(0, 5).map(r => ({ name: r.name, description: r.description.slice(0, 80), source: r.source })),
  });
  saveHistory(entries.slice(0, MAX_ENTRIES));
}

/** Get all history entries, newest first. */
export function getHistory(): HistoryEntry[] {
  return loadHistory();
}

/** Clear history. */
export function clearHistory(): void {
  saveHistory([]);
}
