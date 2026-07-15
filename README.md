# zmarketplace

Cross-agent package marketplace search. One `/zmarketplace` command searches npm, Claude marketplace, Gemini extensions, and the official MCP registry — then browse, audit, and install.

## Install

```bash
pi install npm:zmarketplace
```

Or omp:
```bash
omp plugin install npm:zmarketplace
```

Then `/reload` and type `/zmarketplace`.

## Quick Start

```
/zmarketplace
→ Choose limit: 25 / 50 / 150 / All (paged)
→ Type query: "mcp"
→ Browse 50 results per page (← Previous / → Next)
→ Enter on package → detail + README
→ Enter on ⬇ Install → choose ecosystem → command at bottom
```

## Commands

| Command | What |
|---|---|
| `/zmarketplace` | Interactive search prompt |
| `/zmarketplace search <query>` | Search directly |
| `/zmarketplace search mcp --eco=pi` | Filter by ecosystem |
| `/zmarketplace search theme --type=theme` | Filter by type |
| `/zmarketplace detail <name>` | Show package detail |
| `/zmarketplace audit <name>` | Security scan |
| `/zmarketplace install <name>` | Install flow |

## Detail View

```
 learnship — Details

 ❯ ⬇ Install (audit first)
   🔒 Audit only
   ↩ Back to results
   📦 learnship v2.4.0 — MIT · 0 deps · 1296KB
   Learn as you build. Build with intent.
   🔗 https://www.npmjs.com/package/learnship
   🔗 https://github.com/FavioVazquez/learnship
   ━━━ README ━━━
   # learnship
   ...40 lines of README...
   ...(see npm for full README)
   ✅ Run: pi install npm:learnship
```

- **Actions at top** — Install / Audit / Back
- **README below** — 40 lines, scrollable
- **Enter on 🔗 or 🖼** — opens URL in browser
- **Enter on text** — stays in detail
- **Selected command at bottom** — after picking install option

## Install Options

After audit, choose how to install:

| Option | Command |
|---|---|
| 🥧 pi | `pi install npm:<name>` |
| ⌥ omp | `omp plugin install npm:<name>` |
| 🤖 claude | `claude plugin install npm:<name>` |
| 🔓 opencode | `opencode plugin <name>` |
| 💎 gemini | `gemini extension install <url>` |
| 🔲 codex | `codex plugin add npm:<name>` |
| 📦 npm | `npm install <name>` |
| 🟤 bun | `bun add <name>` |
| 📦 pnpm | `pnpm add <name>` |
| ⚡ bunx | `bunx <name>` |

High-risk packages require confirmation before showing the command.

## Security Audit

| Layer | What it checks |
|---|---|
| Metadata | Dependency count, file count, size, license |
| Source scan | Downloads tarball, scans `.ts`/`.js` for `eval()`, `execSync()`, `rm -rf`, `child_process`, `process.env`, HTTP calls |

Severity levels: 🔴 critical · 🟠 high · 🟡 medium · 🟢 low

## Registries

| Registry | Coverage |
|---|---|
| npm | `pi-package`, `claude-code`, `opencode`, `gemini-cli`, `codex`, `npm`, `bun`, `pnpm` keywords |
| Claude marketplace | Official + community (~800+ plugins) |
| Gemini extensions | geminicli.com (~993 extensions) |
| MCP registry | registry.modelcontextprotocol.io (official) |

All queried in parallel, deduplicated, ranked by relevance.

## Filters

```
--type=extension    extension, skill, theme, prompt, plugin, mcp
--eco=pi            pi, claude, opencode, gemini, codex, npm
--limit=50          25, 50, 150, All (paged at 50/page)
```

## CLI (standalone)

```bash
bunx zmarketplace search "mcp" --limit=5
bunx zmarketplace detail pi-marketplace
bunx zmarketplace audit pi-marketplace
bunx zmarketplace install pi-marketplace
```

Works without any agent. Same core, different interface.

## Architecture

```
src/
├── index.ts              pi/omp extension (registerCommand)
├── cli.ts                standalone CLI (bunx zmarketplace)
├── opencode.ts           opencode plugin entry
├── core/
│   ├── types.ts          unified package model + ecosystem keywords
│   ├── search.ts         cross-registry search + dedup + ranking
│   ├── detail.ts         npm metadata + README fetch
│   ├── audit.ts          2-layer security scanner
│   ├── install.ts        agent detection + command dispatch
│   ├── cache.ts          results cache for ID reference
│   └── tui.ts            icons, formatting, arg parser, help text
└── registries/
    ├── npm.ts            npm registry (parallel per-keyword queries)
    ├── claude.ts         Claude marketplace JSON
    ├── gemini.ts         Gemini CLI extensions registry
    └── mcp.ts            Official MCP registry
```

## Compatibility

| Agent | Status | How |
|---|---|---|
| pi | ✅ Works | `pi install npm:zmarketplace` |
| omp | ✅ Works | `omp plugin install npm:zmarketplace` |
| OpenCode | ✅ Plugin entry | `opencode plugin zmarketplace` |
| Claude Code | ✅ CLI | `bunx zmarketplace search "mcp"` |
| Gemini CLI | ✅ CLI | `bunx zmarketplace search "mcp"` |
| Codex | ✅ CLI | `bunx zmarketplace search "mcp"` |

Zero runtime dependencies. TypeScript with Bun. No Bun-specific APIs (works on pi's jiti/Node loader).

## Support

☕ [ko-fi.com/zicodev](https://ko-fi.com/zicodev)

## License

MIT
