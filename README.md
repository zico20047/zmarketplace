# zmarketplace

Cross-agent marketplace search plugin. Type `/zmarketplace` in pi/omp to search, inspect, audit, and install packages across npm, Claude marketplace, and Gemini extensions.

## Install

```bash
# pi / omp (slash command)
pi install npm:zmarketplace
# or link locally:
omp plugin link ./search_marketplace

# then in omp TUI:
/reload
/zmarketplace search mcp
```

## Usage

```
/zmarketplace search <query> [--type=<type>] [--eco=<ecosystem>] [--limit=<n>]
/zmarketplace detail <id|name>
/zmarketplace audit <id|name>
/zmarketplace install <id|name>
```

### Search

```
/zmarketplace search mcp
/zmarketplace search subagent --eco=pi
/zmarketplace search theme --type=theme --limit=10
```

Opens an interactive select list. Scroll up/down, type to filter, enter to pick.

### Detail + README

Pick a package → select "📋 Details + README" → full README in a scrollable list.

- **Enter on a URL line** (🖼 IMAGE, 🔗 link) → opens in your browser
- **Enter on text** → stays in detail view
- **Type to search** → filters README lines
- **ESC or "Back to menu"** → returns to action menu

### Install

Pick "⬇ Install" → choose ecosystem:

| Option | Command |
|---|---|
| 🥧 pi install | `pi install npm:<name>` |
| ⌥ omp install | `omp plugin install npm:<name>` |
| 🤖 claude install | `claude plugin install npm:<name>` |
| 🔓 opencode install | `opencode plugin <name>` |
| 💎 gemini install | `gemini extension install <url>` |
| 🔲 codex install | `codex plugin add npm:<name>` |
| 📦 npm install | `npm install <name>` |
| ⚡ bunx | `bunx <name>` |

Quick security check runs before showing the command. High-risk packages require confirmation.

### Audit

```
/zmarketplace audit pi-mcp-adapter
```

Two-layer security scan:
- **Layer 1 (metadata):** dependency count, file count, size, license
- **Layer 2 (source):** downloads tarball, scans `.ts`/`.js` for dangerous patterns (`rm -rf`, `eval()`, `execSync()`, `child_process`, etc.)

## Registries

| Source | Coverage |
|---|---|
| npm | `pi-package`, `claude-code`, `opencode`, `gemini-cli`, `codex` keywords |
| Claude marketplace | `anthropics/claude-plugins-official` + community (~800+ plugins) |
| Gemini extensions | `geminicli.com/extensions.json` (~993 extensions) |

## CLI (standalone, no agent needed)

```bash
bunx zmarketplace search "mcp" --limit=5
bunx zmarketplace detail pi-marketplace
bunx zmarketplace audit pi-marketplace
bunx zmarketplace install pi-marketplace
```

## Architecture

```
src/
├── index.ts          ← pi/omp extension: registerCommand("/zmarketplace")
├── cli.ts            ← standalone CLI: bunx zmarketplace
├── opencode.ts       ← opencode plugin entry
├── core/
│   ├── types.ts      ← unified package model
│   ├── search.ts     ← cross-registry search + dedup + ranking
│   ├── detail.ts     ← npm metadata + README fetch
│   ├── audit.ts      ← 2-layer security scanner
│   ├── install.ts    ← agent detection + install command dispatch
│   ├── cache.ts      ← results cache for ID-based reference
│   └── tui.ts        ← icons, formatting, arg parser
└── registries/
    ├── npm.ts        ← npm registry (parallel per-keyword queries)
    ├── claude.ts     ← Claude marketplace JSON
    └── gemini.ts     ← Gemini CLI extensions registry
```

## Cross-agent manifests

| File | Ecosystem |
|---|---|
| `package.json` (`pi.extensions`, `omp.extensions`) | Pi, OMP |
| `package.json` (`bin`, `exports`) | CLI, OpenCode |
| `.claude-plugin/plugin.json` | Claude Code |
| `gemini-extension.json` | Gemini CLI |
| `.codex-plugin/plugin.json` | Codex |

## License

MIT
