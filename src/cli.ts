#!/usr/bin/env bun
/**
 * CLI entry point — standalone command for `bunx zmarketplace`.
 * Works without any agent runtime. Used by Claude Code commands/,
 * Gemini CLI, and Codex.
 *
 * Usage:
 *   bunx zmarketplace search "mcp" --eco=pi --limit=10
 *   bunx zmarketplace detail pi-marketplace
 *   bunx zmarketplace audit pi-marketplace
 *   bunx zmarketplace install pi-marketplace
 */

import { search } from "./core/search.ts";
import { getDetail } from "./core/detail.ts";
import { auditPackage } from "./core/audit.ts";
import { installPackage } from "./core/install.ts";
import { formatResultOption, formatDetailCard, formatAuditReport, formatCompareCard, formatHelp, parseArgs } from "./core/tui.ts";
import type { SearchOptions } from "./core/types.ts";
import { getHistory, clearHistory, recordSearch } from "./core/history.ts";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  switch (parsed.subcommand) {
    case "":
    case "help": {
      console.log(formatHelp());
      break;
    }

    case "search":
    case "s": {
      const query = parsed.positional.join(" ").trim();
      const opts: SearchOptions = {
        query,
        type: (parsed.flags["type"] as SearchOptions["type"]) ?? "all",
        ecosystem: (parsed.flags["eco"] as SearchOptions["ecosystem"]) ?? "all",
        limit: Math.max(1, parseInt(parsed.flags["limit"] ?? "20", 10) || 20),
      };

      console.log(`Searching for "${query || "all"}"...`);
      const results = await search(opts);
      recordSearch(query, results);
      if (parsed.flags.json) {
        console.log(JSON.stringify(results, null, 2));
        break;
      }

      if (results.length === 0) {
        console.log("No packages found.");
        break;
      }

      console.log(`\n${results.length} package(s) found:\n`);
      for (let i = 0; i < results.length; i++) {
        const opt = formatResultOption(results[i], i);
        console.log(`  ${opt.label}`);
        if (results[i].installCommand) {
          console.log(`     → ${results[i].installCommand}`);
        }
      }
      break;
    }

    case "detail":
    case "d":
    case "info": {
      const name = parsed.positional[0];
      if (!name) {
        console.error("Error: package name required. Usage: zmarketplace detail <name>");
        process.exit(1);
      }

      const detail = await getDetail(name);
      if (!detail) {
        console.error(`Package "${name}" not found.`);
        process.exit(1);
      }

      if (parsed.flags.json) {
        console.log(JSON.stringify(detail, null, 2));
        break;
      }

      console.log(formatDetailCard(detail));
      break;
    }

    case "audit":
    case "a": {
      const name = parsed.positional[0];
      if (!name) {
        console.error("Error: package name required. Usage: zmarketplace audit <name>");
        process.exit(1);
      }

      console.log(`Auditing ${name} (downloading source)...`);
      const report = await auditPackage(name, { deepScan: parsed.flags["deepScan"] !== "false" });
      if (parsed.flags.json) {
        console.log(JSON.stringify(report, null, 2));
        break;
      }
      console.log("\n" + formatAuditReport(report));
      break;
    }

    case "install":
    case "i": {
      const name = parsed.positional[0];
      if (!name) {
        console.error("Error: package name required. Usage: zmarketplace install <name>");
        process.exit(1);
      }

      console.log(`Auditing ${name} before install...`);
      const report = await auditPackage(name, { deepScan: true });
      console.log("\n" + formatAuditReport(report));

      if (report.risk === "critical" || report.risk === "high") {
        console.error(`\n⚠️  HIGH RISK: ${name} has ${report.risk} security issues. Review findings above.`);
        console.error("If you still want to install, run the command manually.");
        process.exit(1);
      }

      const result = await installPackage(name, { skipAudit: true });
      if (parsed.flags.json) {
        console.log(JSON.stringify({ name, command: result.command }, null, 2));
        break;
      }
      console.log(`\n✅ Ready to install:`);
      console.log(`  ${result.command}`);
      break;
    }

    case "compare":
    case "c": {
      const name1 = parsed.positional[0];
      const name2 = parsed.positional[1];
      if (!name1 || !name2) {
        console.error("Error: two package names required. Usage: zmarketplace compare <pkg1> <pkg2>");
        process.exit(1);
      }

      console.log(`Fetching details for ${name1} and ${name2}...`);
      const [detail1, detail2] = await Promise.all([getDetail(name1), getDetail(name2)]);

      if (!detail1) { console.error(`Package "${name1}" not found.`); process.exit(1); }
      if (!detail2) { console.error(`Package "${name2}" not found.`); process.exit(1); }

      console.log("\n" + formatCompareCard(detail1, detail2));
      break;
    }

    case "history":
    case "h": {
      const entries = getHistory();
      if (entries.length === 0) {
        console.log("No search history.");
        break;
      }
      console.log(`\n${entries.length} search(es):\n`);
      for (let i = 0; i < Math.min(entries.length, 30); i++) {
        const e = entries[i];
        const time = e.timestamp.slice(0, 16).replace("T", " ");
        const top = e.topResults.slice(0, 3).map(r => r.name).join(", ");
        console.log(`  [${i + 1}] "${e.query}" — ${e.resultCount} results (${time})${top ? ` ▸ ${top}` : ""}`);
      }
      break;
    }
    default:
      console.error(`Unknown subcommand: ${parsed.subcommand}\n`);
      console.log(formatHelp());
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
