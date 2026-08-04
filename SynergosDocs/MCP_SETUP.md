> ⚠️ **OBSOLETO desde la purga de Nx (2026-08-04).** Este documento describe la arquitectura de build anterior. El build actual: `platforms/angular/tools/build.mjs` — ver BUILD_PIPELINE.md.

# MCP Setup — Angular CLI + Nx

This workspace ships a `.mcp.json` at the root that registers both MCP servers.
AI agents (Claude Code, Cursor, Copilot, Codex) pick this up automatically.

---

## Project-level config (`.mcp.json`)

```json
{
  "mcpServers": {
    "angular-cli": {
      "command": "npx",
      "args": ["-y", "@angular/cli", "mcp"]
    },
    "nx": {
      "command": "npx",
      "args": ["-y", "nx-mcp@latest"]
    }
  }
}
```

This file is committed to the repo — every developer and agent that opens the workspace gets both servers without extra setup.

---

## Angular CLI MCP (`angular-cli`)

Provided by `@angular/cli` (bundled — no extra install needed).
Run `ng mcp` to verify the output matches the config above.

### Capabilities

| Tool | Description |
|---|---|
| `ng-generate` | Scaffold components, services, guards, pipes with correct config |
| `ng-build` | Build analysis and output inspection |
| `ng-lint` | Lint project with ESLint |
| `ng-test` | Run Vitest unit tests |
| Template analysis | Angular compiler template validation |
| Schema access | All `@nx/angular` generator schemas |

---

## Nx MCP (`nx`)

Provided by `nx-mcp` (no extra install — runs via `npx`).

### Capabilities

| Tool | Description |
|---|---|
| `nx_workspace` | Full workspace project graph |
| `nx_project_details` | Targets, tags, dependencies for a project |
| `nx_affected` | Which projects are affected by a change |
| `nx_docs` | Nx documentation lookup |
| `create_nx_workspace` | Scaffold new Nx workspace |

---

## Claude Code

Claude Code reads `.mcp.json` automatically when you open the workspace.
It also reads `CLAUDE.md` (workspace root) for project-specific context.

To confirm servers are active, run inside Claude Code:
```
/mcp
```

---

## Codex (OpenAI)

Codex reads `AGENTS.md` (workspace root) for project context.
MCP server support in Codex follows the same `.mcp.json` standard.

---

## Cursor / Windsurf / Copilot

These editors also respect `.mcp.json` at the workspace root.
No additional configuration required.

---

## Agent workflow

When generating code, agents should:

1. Call `nx_project_details` → understand where the new file belongs
2. Read `SynergosDocs/DESIGN_SYSTEM.md` or `FEATURE_ARCHITECTURE.md` → confirm placement
3. Use `ng-generate` / `nx g @nx/angular:component` → scaffold with correct config
4. Apply `LLM.txt` rules → standalone, OnPush, signals, correct naming
5. Export new symbols from `libs/shared/src/index.ts`

### Example

```
User: "Create a CardComponent in libs/shared"

Agent:
1. nx_project_details("shared")             → confirm path and tags
2. Read SynergosDocs/DESIGN_SYSTEM.md       → belongs in components/
3. ng-generate component card               → scaffold
4. Rename to card.ts, apply OnPush+signals  → follow LLM.txt §4
5. Export from libs/shared/src/index.ts
```

---

## Anti-pattern detection (via Angular CLI MCP)

| Anti-pattern | Detection |
|---|---|
| Non-standalone components | TypeScript AST via Angular compiler |
| `NgModule` usage | Decorator detection |
| Zone.js imports | File scan |
| Missing `OnPush` | Component metadata |
| `@Input()` / `@Output()` decorators | AST analysis |
| Hardcoded colours / spacing in SCSS | SCSS lint |
