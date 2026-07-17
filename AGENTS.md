# Repository Guidelines

> zmarketplace — cross-agent package marketplace search. One `/zmarketplace` command (or `bunx zmarketplace`) searches npm, the Claude marketplace, Gemini extensions, the official MCP registry, Smithery, and GitHub topics — then browse, detail, audit, and install across pi/omp/claude/opencode/gemini/codex.

## Project Overview

zmarketplace is a **zero-dependency, cross-runtime** TypeScript tool that unifies package discovery across agent ecosystems. It runs as a pi/omp slash command, a standalone CLI, and an OpenCode tool. Users search once, get normalized results from 6 live registries (+1 stub), run a 3-layer security audit, and install into whichever agent they target. The codebase deliberately avoids Bun-specific APIs so the same `.ts` sources run under Bun, Node (jiti), and the various agent runtimes.

## Architecture & Data Flow

Three entry points feed one shared core:

```
src/index.ts      pi/omp slash command (registerCommand) — interactive UI
src/cli.ts        standalone CLI (bunx zmarketplace)      — process.argv + JSON
src/opencode.ts   OpenCode tool                            — shells out to bunx zmarketplace
        │
        ▼
src/core/search.ts ── registriesForOptions() ──▶ 7 registry adapters (src/registries/*)
        │              Promise.allSettled()         each normalizes → PackageResult
        │              (rejects silently dropped)
        ├─ deduplicate()  (by name; prefer npm, else keep first; union ecosystems; max downloads)
        ├─ scoreResult()  (exact > prefix > substring > description; ecosystem bonus)
        └─ slice(limit) ──▶ cacheResults() + recordSearch() ──▶ UI/CLI render (tui.ts)
```

**Search flow:** entry → `parseArgs` → `doSearch` → `search(SearchOptions)` → fan out to registries in parallel → filter by `type`/`ecosystem` → dedup → rank → cache + persist history → render.

**Audit flow (`audit.ts`):** Layer 1 reads npm metadata (deps > 20, size > 10 MB, files > 500, no license, lifecycle/install scripts). Layer 2 downloads the `.tgz` and **gunzips** it (npm tarballs are gzip — without decompression the source scan extracts zero files), runs `extractTextFilesFromTar`, then `scanSource` matches a 4-tier danger regex set (critical → info, deduped per file). Layer 3 (optional) fetches a Socket.dev supply-chain score when `SOCKET_API_KEY` is set. `computeRisk` weights findings into a risk rating. Output always links to socket.dev — the scan is heuristic and does not analyze the dependency tree.

**Install flow (`index.ts`/`install.ts`):** validate name → audit **first** → build per-ecosystem install command menu → high/critical risk requires confirm → `spawn(command, { shell: true })` auto-executes → prompt `/reload`.

**The unified model (`types.ts`) is the common currency** every adapter produces:
- `PackageResult` — normalized search hit (`name`, `description`, `ecosystems[]`, `type`, `source`, …).
- `PackageDetail extends PackageResult` — adds `readme`, `dependencyCount`, `size`, `fileCount`, `keywords`, agent manifests.
- Unions: `Ecosystem` (9), `PackageType` (13), `RegistrySource` (7). `ECOSYSTEM_KEYWORDS` is the single source of truth for npm keyword→ecosystem mapping.

## Key Directories

| Path | Purpose |
|---|---|
| `src/core/` | Domain logic: `types.ts` (model), `search.ts` (aggregate), `detail.ts` (npm metadata), `audit.ts` (security scan + tar parser), `install.ts` (agent dispatch), `installed.ts` (lock-file detector), `cache.ts` (in-memory), `history.ts` (persistent), `tui.ts` (formatting + `parseArgs`). |
| `src/registries/` | One adapter per registry: `npm`, `claude`, `gemini`, `mcp`, `smithery`, `github`, `pi-dev` (stub). npm also exports `getNpmPackageMeta`, `detectEcosystems`, `detectType`. |
| `test/` | `full-test.ts` (integration, live registries) + `unit/` (cache, history, installed, tar — pure local). |
| `commands/` | Agent command definitions (e.g. `zmarketplace.md` — Claude/Codex slash-command spec). |
| `.claude-plugin/`, `.codex-plugin/`, `gemini-extension.json` | Per-agent registration manifests. |
| `.github/workflows/` | `ci.yml` (typecheck + test + CLI smoke on PR/push), `publish.yml` (npm publish with provenance). |

## Development Commands

```bash
bun x tsc --noEmit          # typecheck (npm run typecheck)
bun run test                # integration suite (test/full-test.ts) — hits live registries
bun run test:unit           # all unit tests (cache/history/installed/tar) — pure local
bun run test/unit/foo.test.ts   # a single unit test
bun run src/cli.ts search "mcp" --eco=pi --limit=5 --json   # run the CLI locally
```

Install the local build as a pi plugin (for interactive `/zmarketplace` testing):

```bash
pi install .            # from repo root — registers the local path in settings
pi remove npm:zmarketplace   # avoid duplicate command registration with the published copy
# then /reload in your pi session
```

## Code Conventions & Common Patterns

- **Registry adapter contract** — every adapter is `async function search<Name>(query: string, limit = 25): Promise<PackageResult[]>`. npm is the exception (`searchNpm(query, options)`). Adding a registry: create `src/registries/<name>.ts`, add it to `RegistrySource` **and** to the `registriesForOptions()` list in `search.ts` (kept in sync manually), add a query branch.
- **`Promise.allSettled` for fault isolation** — `search.ts` fans out to all registries in parallel; a single rejected/down registry is filtered out, never propagated.
- **Silent `catch {}` returning `[]`** is the deliberate convention in every adapter and I/O helper (`npm`, `mcp`, `smithery`, `github`, `gemini`, `audit`, `history`, `installed`). One registry being down must not break search. The only surfacing exception: `github.ts` emits `console.warn` on 403/429 rate-limit before returning `[]`.
- **Every `fetch` carries a timeout** via `{ signal: AbortSignal.timeout(ms) }` — 10 s (most), 15 s (gemini, mcp), 30 s (audit tarball). Never a bare `fetch(url)`.
- **Module-level caches:** `cache.ts` (last search + audit LRU Map, max 150, promote-on-get), `installed.ts` (10 s TTL), `gemini.ts` (5 min TTL for the 12k-entry registry). `history.ts` persists to `~/.zmarketplace/history.json` (max 100, **atomic write** via temp + `renameSync`).
- **TypeScript:** `import type` for type-only imports everywhere; source imports use the `.ts` extension (Bun/bundler resolution — no `.js`); strict mode; no runtime dependencies.
- **Input validation:** package names are checked against `/^[a-z0-9._@/\-]+$/i` before install; URLs are restricted to `http(s)://` before opening.
- **Slash-command UI vs CLI:** `index.ts` is interactive (`ctx.ui.select/input/confirm`, 50-per-page pagination, auto-installs via `spawn`); `cli.ts` prints to stdout, supports `--json`, and `process.exit(1)` on high risk. `opencode.ts` adds no logic — it delegates to `bunx zmarketplace`.
- **`resolveRef(ref)`** lets slash users refer to a cached result by 1-based index *or* name.

## Important Files

| File | Why it matters |
|---|---|
| `src/core/types.ts` | The model every module speaks. Change a union here and several files follow. |
| `src/core/search.ts` | Aggregation, dedup, ranking. `registriesForOptions()` mirrors `RegistrySource`. |
| `src/core/audit.ts` | 3-layer scan (metadata + decompressed source + optional Socket) + hand-written POSIX/GNU tar parser (`extractTextFilesFromTar`, exported for testing). |
| `src/core/tui.ts` | All formatting + `parseArgs()` (the shared arg parser for both entry points). |
| `src/index.ts` | The pi/omp command handler — the richest UX path. |
| `src/cli.ts` | Standalone entry; mirrors index.ts subcommands in non-interactive form. |
| `package.json` | `exports` map, `bin`, `pi`/`omp` extension fields (both → `src/index.ts`), scripts. |
| `tsconfig.json` | `noEmit` + `allowImportingTsExtensions` + `bundler` resolution — buildless ESM. |

## Runtime/Tooling Preferences

- **Runtime: Bun ≥ 1.1.0** (`engines.bun`). Also runs under Node via jiti (used by some agent runtimes).
- **No Bun-specific APIs** (`Bun.*`). Use `node:fs`, `node:os`, `node:path`, `node:child_process`, global `fetch`, `AbortSignal.timeout`. This keeps the same sources cross-runtime.
- **Package manager: Bun** (`bun.lock`). **Zero runtime dependencies** — do not add any. devDependencies are `typescript` and `@types/bun` only.
- **Buildless:** sources ship as `.ts`; no compile step, `tsc --noEmit` is typecheck-only.
- **Platform:** developed/tested on Windows and POSIX. Atomic writes use same-filesystem `renameSync` (safe on both); temp/history go under `os.homedir()/.zmarketplace`.

## Testing & QA

- **No test framework.** A tiny custom runner: `ok(name, cond)` increments `pass`/`fail`, prints ✅/❌, and `process.exit(1)` if any assertion fails. New tests follow this exact pattern.
- **Integration (`test/full-test.ts`):** 24 assertions; exercises search/detail/audit/install against **live** registries — network-dependent, not deterministic.
- **Unit (`test/unit/*.test.ts`):** 46 assertions; pure-local, deterministic.
  - `cache.test.ts` — ref resolution + LRU eviction proof.
  - `history.test.ts`, `installed.test.ts` — FS isolation via `mkdtempSync` + `USERPROFILE`/`HOME` override.
  - `tar.test.ts` — constructs tar buffers in-memory to verify the parser (bounds, POSIX `0x20` flag, GNU `L` long names).
- **Isolation gotcha:** `history.ts` captures `homedir()` at module load → must set the env var *before* a dynamic `import()`. `installed.ts` reads `homedir()` at call time → static import is fine. Both clean up temp dirs in `finally`.
- **CI gate (`.github/workflows/ci.yml`):** install → `tsc --noEmit` → full test → CLI smoke. Publish workflow adds provenance.

## Conventions to follow

- **Commits:** prefer **Conventional Commits** — `feat:`, `fix:`, `test:`, `docs:`, `chore:` (e.g. `fix: harden audit tarball size guard`). Older history used kebab-case; new work should use Conventional Commits.
- **Adding a package type / ecosystem:** update the union in `types.ts`, the icon/label maps in `tui.ts` (`TYPE_ICON`, `ECO_LABEL`), and the help text + README filter table.
- **Keep registries in sync:** `RegistrySource` (types.ts) and the `registriesForOptions()` list (search.ts) are maintained by hand.
