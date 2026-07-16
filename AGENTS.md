# Repository Guidelines

## Project Overview

**zmarketplace** is a cross-agent package marketplace search plugin for pi and omp. Users type `/zmarketplace` to search npm, Claude marketplace, Gemini extensions, MCP registry, Smithery, and GitHub topics — then browse, audit, and install packages. Zero runtime dependencies. Works on pi (jiti/Node) and omp (Bun).

## Architecture & Data Flow

```
/zmarketplace search "mcp"
      │
      ▼
src/index.ts (pi extension → registerCommand)
      │
      ▼
src/core/search.ts (dispatcher)
      │  Promise.allSettled — all in parallel
      ├──► registries/npm.ts       (npm keyword search)
      ├──► registries/claude.ts    (GitHub raw JSON)
      ├──► registries/gemini.ts    (geminicli.com JSON)
      ├──► registries/mcp.ts       (modelcontextprotocol.io)
      ├──► registries/smithery.ts  (api.smithery.ai)
      └──► registries/github.ts    (GitHub search API)
      │
      ▼
deduplicate → score → paginate → display via ctx.ui.select()
```

Three entry points, shared core:
1. **`src/index.ts`** — pi/omp extension (default export factory → `registerCommand`)
2. **`src/cli.ts`** — standalone CLI (`bunx zmarketplace search/detail/audit/install`)
3. **`src/opencode.ts`** — OpenCode plugin (shells out to CLI via Bun `$`)

## Key Directories

| Directory | Purpose |
|---|---|
| `src/` | All source code (3 entry points) |
| `src/core/` | Shared logic: types, search, audit, detail, install, cache, installed, history, tui |
| `src/registries/` | 6 registry adapters, each exports `searchXxx(query, limit)` |
| `test/` | Integration tests (`full-test.ts` — 10 tests, 24 assertions) |
| `.github/workflows/` | CI (typecheck+test on push) and publish (OIDC on release) |

## Development Commands

```bash
# Install deps
bun install

# Typecheck
bun x tsc --noEmit

# Run tests (requires network — hits live registries)
bun run test/full-test.ts

# CLI smoke test
bun run src/cli.ts search "mcp" --limit=3
bun run src/cli.ts detail pi-marketplace
bun run src/cli.ts audit pi-marketplace

# Publish (manual)
npm publish --access public

# Publish (via GitHub release — auto CI + OIDC)
git tag v0.7.4 && git push origin v0.7.4
# Then create release on GitHub → workflow auto-publishes
```

## Code Conventions & Common Patterns

### Imports
- All relative imports use `.ts` extensions: `import { search } from "./core/search.ts"`
- Type-only imports use `import type`: `import type { PackageResult } from "./core/types.ts"`
- No bare package imports at runtime (zero deps). Types declared locally, not imported from `@oh-my-pi/*`

### Error handling
- Registry fetches wrapped in try/catch, return `[]` on failure (silent, non-fatal)
- `AbortSignal.timeout(10000–30000)` on all `fetch()` calls
- Command handler wraps in try/catch to never crash the agent

### Registry adapter pattern
Every registry adapter follows the same shape:
```typescript
export async function searchXxx(query: string, limit: number): Promise<PackageResult[]> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  // ... map response → PackageResult[]
}
```

### pi/omp extension factory
```typescript
export default function(pi: { registerCommand?(...): void }) {
  pi.registerCommand?.("zmarketplace", commandDef);
}
```
- **Never call `pi.setLabel()`** — it's an action method, throws on pi v0.80.6
- Handler receives `(args: string, ctx)` — args is a raw string, must `.split()` manually
- `ctx.ui.select(title, stringArray)` — use plain strings, NOT `{ label, value }` objects (pi shows `[object Object]`)

### Cross-runtime compatibility
- Use `node:child_process` `spawn()` — NOT `Bun.spawn()` (pi uses jiti/Node, `Bun` undefined)
- Use `node:fs`, `node:path`, `node:os` — NOT Bun-specific APIs
- `process.platform` for OS detection

### Type system
- `PackageType`: 13 values (extension, skill, theme, prompt, plugin, mcp, hook, command, agent, context, lsp, formatter, unknown)
- `Ecosystem`: 9 values (pi, omp, claude, opencode, gemini, codex, npm, universal, unknown)
- `ECOSYSTEM_KEYWORDS`: Record mapping ecosystem → npm search keywords

## Important Files

| File | Role |
|---|---|
| `src/index.ts` | **Main entry** — pi/omp extension, `/zmarketplace` command, all UI logic |
| `src/core/types.ts` | **Canonical types** — PackageResult, AuditReport, ECOSYSTEM_KEYWORDS |
| `src/core/search.ts` | **Search dispatcher** — calls all registries, dedup, rank |
| `src/core/audit.ts` | **Security scanner** — metadata + tarball source scan with inline tar extractor |
| `src/registries/npm.ts` | **npm adapter** — also exports detectEcosystems, detectType, installCommandFor |
| `package.json` | `pi.extensions`, `omp.extensions`, `bin`, `exports`, `files` whitelist |
| `tsconfig.json` | `allowImportingTsExtensions`, `strict`, `noEmit` |

## Runtime/Tooling Preferences

| Requirement | Value |
|---|---|
| Runtime | **Bun** (omp) or **Node/jiti** (pi) — must work on both |
| Package manager | Bun (`bun install`) |
| TypeScript | Strict mode, `noEmit`, `.ts` import extensions |
| Dependencies | **Zero runtime deps**. devDeps: `typescript`, `@types/bun` only |
| Publish | `files` whitelist controls what ships: `src/`, `README.md`, manifests only |

## Testing & QA

| Test | What | Command |
|---|---|---|
| Typecheck | `tsc --noEmit` | `bun x tsc --noEmit` |
| Integration | 10 tests hitting live registries | `bun run test/full-test.ts` |
| CLI smoke | Search + detail + audit | `bun run src/cli.ts search "mcp"` |
| CI | Auto-runs on push/PR | GitHub Actions `.github/workflows/ci.yml` |

Tests require network access (they hit npm, Claude marketplace, Gemini registry live). No mocks. If a registry is down, that test may fail — check if other tests pass.

## Known Issues

- Plugin manifests (`.claude-plugin/`, `.codex-plugin/`, `gemini-extension.json`) have stale version `0.3.0` — should match `package.json`
- OpenCode plugin is experimental (shells out to CLI, no direct slash command support)
- GitHub topics search has 60 req/hour rate limit without auth token
