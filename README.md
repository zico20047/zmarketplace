# zmarketplace

Cross-agent marketplace search plugin. Type `/zmarketplace` in pi/omp to search, inspect, audit, and install packages across npm, Claude marketplace, Gemini extensions, and the official MCP registry.

## Install

```bash
# pi
pi install npm:zmarketplace

# omp
omp plugin install npm:zmarketplace

# then reload
/reload
/zmarketplace
```

## Usage

```
/zmarketplace                    → prompt for search query
/zmarketplace search mcp         → search directly
/zmarketplace audit <name>       → security scan
/zmarketplace install <name>     → install flow
```

### Search flow

```
/zmarketplace
→ Choose limit: 25 / 50 / 150 / All (paged)
→ Type query: "mcp"
→ Browse results (50 per page, ← Previous / → Next)
→ Enter on a package → detail view
```

### Detail view

```
 learnship — Details

 ❯ ⬇ Install (audit first)        ← actions at TOP
   🔒 Audit only
   ↩ Back to results
   📦 learnship v2.4.0 — MIT · 0 deps · 1296KB
   Learn as you build...
   🔗 https://www.npmjs.com/package/learnship
   🔗 https://github.com/FavioVazquez/learnship
   ━━━ README (40 lines) ━━━
   # learnship
   ...README content...
   ✅ Run: pi install npm:learnship  ← selected command at BOTTOM
```

- **Enter on 🔗/🖼 line** → opens URL in browser
- **Enter on text** → stays in detail
- **Type to search** → filters lines
- **ESC** → stays in detail

### Install flow

Pick "⬇ Install" → audit runs first → choose ecosystem:

| Option | Command |
|---|---|
| 🥧 pi | `pi install npm:<name>` |
| ⌥ omp | `omp plugin install npm:<name>` |
| 🤖 claude | `claude plugin install npm:<name>` |
| 🔓 opencode | `opencode plugin <name>` |
| 💎 gemini | `gemini extension install <url>` |
| 🔲 codex | `codex plugin add npm:<name>` |
| 📦 npm | `npm install <name>` |
| ⚡ bunx | `bunx <name>` |

The selected command appears at the bottom of the detail list.

## Registries searched

| Registry | What | Source |
|---|---|---|
| **npm** | pi/omp, claude, opencode, gemini, codex packages | `registry.npmjs.org` |
| **Claude marketplace** | ~800+ Claude Code plugins | `anthropics/claude-plugins-official` + community |
| **Gemini extensions** | ~993 Gemini CLI extensions | `geminicli.com/extensions.json` |
| **MCP registry** | MCP servers | `registry.modelcontextprotocol.io` |

All registries queried in parallel. Results deduplicated and ranked.

## Security audit

Two-layer scan before install:

| Layer | What |
|---|---|
| **Metadata** | Dependency count, file count, size, license |
| **Source** | Downloads tarball, scans `.ts`/`.js` for `eval()`, `execSync()`, `rm -rf`, `child_process`, etc. |

Severity: 🔴 critical · 🟠 high · 🟡 medium · 🟢 low

## CLI (standalone)

```bash
bunx zmarketplace search "mcp" --limit=5
bunx zmarketplace detail pi-marketplace
bunx zmarketplace audit pi-marketplace
```

## Architecture

```
src/
├── index.ts              ← pi/omp extension (registerCommand)
├── cli.ts                ← standalone CLI (bunx zmarketplace)
├── opencode.ts           ← opencode plugin entry
├── core/
│   ├── types.ts          ← unified package model
│   ├── search.ts         ← cross-registry search + dedup + ranking
│   ├── detail.ts         ← npm metadata + README fetch
│   ├── audit.ts          ← 2-layer security scanner
│   ├── install.ts        ← agent detection + command dispatch
│   ├── cache.ts          ← results cache for ID reference
│   └── tui.ts            ← icons, formatting, arg parser
└── registries/
    ├── npm.ts            ← npm (parallel per-keyword queries)
    ├── claude.ts         ← Claude marketplace JSON
    ├── gemini.ts         ← Gemini CLI extensions
    └── mcp.ts            ← Official MCP registry
```

## Cross-agent manifests

| File | Ecosystem |
|---|---|
| `package.json` (`pi.extensions`, `omp.extensions`) | Pi, OMP |
| `package.json` (`bin`) | CLI |
| `.claude-plugin/plugin.json` | Claude Code |
| `gemini-extension.json` | Gemini CLI |
| `.codex-plugin/plugin.json` | Codex |

## Support

☕ [ko-fi.com/zicodev](https://ko-fi.com/zicodev)

## License

MIT
