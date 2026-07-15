---
description: Search packages across agent registries (npm, Claude, Gemini, MCP, Smithery, GitHub)
---

Use `bunx zmarketplace` to execute the search. Parse the user's request and run the appropriate command.

## Search packages

```bash
bunx zmarketplace search "<query>" [--limit=<n>] [--eco=<ecosystem>] [--type=<type>]
```

Ecosystems: pi, claude, opencode, gemini, codex, npm
Types: extension, skill, theme, prompt, plugin, mcp

## Show package details

```bash
bunx zmarketplace detail "<package-name>"
```

## Security audit

```bash
bunx zmarketplace audit "<package-name>"
```

## Install

```bash
bunx zmarketplace install "<package-name>"
```

Present the results clearly with package name, ecosystem, description, and install command.
