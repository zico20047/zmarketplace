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
import { formatResultOption, formatDetailCard, formatAuditReport, formatHelp, parseArgs } from "./core/tui.ts";
import type { SearchOptions } from "./core/types.ts";

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
        limit: parseInt(parsed.flags["limit"] ?? "20", 10),
      };

      console.log(`Searching for "${query || "all"}"...`);
      const results = await search(opts);

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
      console.log(`\n✅ Ready to install:`);
      console.log(`  ${result.command}`);
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
