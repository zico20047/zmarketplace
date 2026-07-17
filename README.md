# zmarketplace

Package marketplace search. One `/zmarketplace` command searches npm, marketplace, extensions, MCP registry, Smithery, and LSP,Skills and install.

## Demo

![zmarketplace demo](assets/demo.gif)

## Status

| Agent | Support |
|---|---|
| **pi** | ✅ Full — `/zmarketplace` slash command + auto-install |
| **omp** | ✅ Full — `/zmarketplace` slash command + auto-install |
| **CLI** | ✅ `bunx zmarketplace search/detail/audit/install` |
| OpenCode | 🔧 Experimental — tool only (no slash command) |
| Claude Code | 🔧 CLI only |
| Gemini CLI | 🔧 CLI only |
| Codex | 🔧 CLI only |

## Install

```bash
pi install npm:zmarketplace
```

Or omp:
```bash
omp plugin install npm:zmarketplace
```

Then `/reload` and type `/zmarketplace`.

## Commands

```
/zmarketplace                     Interactive search prompt
/zmarketplace search <query>      Search all registries
/zmarketplace browse --type=<t>   Browse all packages of a type
/zmarketplace popular             Browse popular packages
/zmarketplace updates             Check installed for updates
/zmarketplace detail <name>       Show package details + README
/zmarketplace audit <name>        Security scan
/zmarketplace install <name>      Audit + install
```

## Quick Start

```
/zmarketplace
→ Choose limit: 25 / 50 / 150 / All (paged)
→ Type query: "mcp"
→ Browse 50 results per page (← Previous / → Next)
→ Enter on package → detail + README
→ ⬇ Install → choose ecosystem → installs automatically
→ /reload to activate
```

## Search

Searches **7 registries in parallel** (6 live + pi-dev pending):

| Registry | Coverage |
|---|---|
| npm | `pi-package`, `claude-code`, `opencode`, `gemini-cli`, `codex`, `npm`, `bun`, `pnpm` keywords |
| Claude marketplace | Official + community (~800+ plugins) |
| Gemini extensions | geminicli.com (~993 extensions) |
| MCP registry | registry.modelcontextprotocol.io (official) |
| Smithery | api.smithery.ai (MCP servers) |
| GitHub topics | `topic:claude-code`, `topic:mcp-server`, etc |
| pi-dev | *(pending — no public registry URL yet)* |

### Filters

```
/zmarketplace search mcp --eco=pi
/zmarketplace search theme --type=theme
/zmarketplace search --limit=150
```

| Filter | Values |
|---|---|
| `--eco` | pi, claude, opencode, gemini, codex, npm |
| `--type` | extension, skill, theme, prompt, plugin, mcp, hook, command, agent, context, lsp, formatter |
| `--limit` | 25, 50, 150, All (paged at 50/page) |
| `--json` | Machine-readable JSON output |

## Detail View

```
 zmarketplace — Details

 ❯ ⬇ Install (audit first)
   🔒 Audit only
   ↩ Back to results
   📦 zmarketplace v0.0.0 — MIT · 0 deps · 1000KB
   Learn as you build. Build with intent.
   🔗 https://www.npmjs.com/package/zmarketplace
   🔗 https://github.com/zico20047/zmarketplace
   ━━━ README ━━━
   # zmarketplace
   ...40 lines...
   ✅ Run: pi install npm:zmarketplace
```

- ✓ marks packages you already have installed
- Enter on 🔗 or 🖄 → opens in browser
- Enter on text → stays in detail
- Type to filter lines

## Install

After audit, choose ecosystem (auto-installs):

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

High-risk packages require confirmation.

## Updates

```
/zmarketplace updates
```

Scans installed packages, compares with latest on npm:

```
 2 updates available (5 packages)

 ❯ ⬆ pi-subagents: 0.14.0 → 0.34.0 [omp]
   ⬆ bigpowers: 2.76.3 → 2.77.0 [omp]
   ✓ pi-hypa: 0.1.11 [omp]
   ↩ Back
```

## Security Audit

| Layer | What |
|---|---|
| Metadata | Dependency count, file count, size, license, **install/lifecycle scripts** |
| Source scan | Decompresses `.tgz`, scans `.ts`/`.js` for `eval()`, `execSync()`, `rm -rf`, `child_process`, `process.env`, HTTP calls |
| Socket.dev | Optional supply-chain score when `SOCKET_API_KEY` is set |

Severity: 🔴 critical · 🟠 high · 🟡 medium · 🟢 low

## CLI

```bash
bunx zmarketplace search "mcp" --limit=5
bunx zmarketplace detail pi-marketplace
bunx zmarketplace audit pi-marketplace
bunx zmarketplace install pi-marketplace
bunx zmarketplace browse --type=hook
bunx zmarketplace search "mcp" --json --eco=pi
```

## Troubleshooting & Debugging

### Audit or install hangs
The audit downloads + scans a package tarball; a very large package can take a while. If a command freezes, press **Esc** (kills an interactive command), **Ctrl+Break** (Windows), or close the terminal and resume with `pi --resume`.

### Enabling pi debug output
These aren't in `pi --help`, but the runtime reads them:

| Env / flag | What it shows |
|---|---|
| `PI_DEBUG_STARTUP=1 pi` | Streams `[startup] phase:start/:done` to stderr — survives a hard hang; the last line names the stuck phase |
| `PI_TIMING=full pi` | Module-load timing span tree (stderr) |
| `pi --verbose` | Verbose startup (overrides `quietStartup`) |

PowerShell: `$env:PI_DEBUG_STARTUP=1; pi` (PowerShell can't read `VAR=1 cmd` like bash).

### zmarketplace not loading after install
`/reload`, then check `pi list`. If both `npm:zmarketplace` and a local path are listed, remove one (`pi remove npm:zmarketplace`) to avoid a duplicate `/zmarketplace` command.

Run `/hotkeys` inside pi to see all active keybindings.

## Architecture

```
src/
├── index.ts              pi/omp extension (registerCommand)
├── cli.ts                standalone CLI (bunx zmarketplace)
├── opencode.ts           opencode plugin (experimental)
├── core/
│   ├── types.ts          unified model + ecosystem keywords
│   ├── search.ts         cross-registry search + dedup + ranking
│   ├── detail.ts         npm metadata + README fetch
│   ├── audit.ts          3-layer security scanner (metadata + source + socket)
│   ├── install.ts        agent detection + command dispatch
│   ├── installed.ts      installed packages detector
│   ├── cache.ts          results cache
│   ├── history.ts        search history (persistent)
│   └── tui.ts            icons, formatting, help
└── registries/
    ├── npm.ts            npm (parallel per-keyword)
    ├── claude.ts         Claude marketplace JSON
    ├── gemini.ts         Gemini CLI extensions
    ├── mcp.ts            Official MCP registry
    ├── smithery.ts       Smithery MCP servers
    ├── github.ts         GitHub topics search
    └── pi-dev.ts         pi-dev registry (stub)
```

Zero runtime dependencies. Works on pi (jiti/Node) and omp (Bun). No Bun-specific APIs.

## Support

☕ [ko-fi.com/zicodev](https://ko-fi.com/zicodev)

## License

MIT
