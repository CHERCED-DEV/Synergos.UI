# Synergos UI — Claude Code Project Config

## Governance
All code generation MUST follow `LLM.txt` in the workspace root.
Architecture documentation is in `SynergosDocs/` — read before generating code.

## MCP Servers (auto-loaded from .mcp.json)
- `angular-cli` → Angular CLI MCP (`npx @angular/cli mcp`)
- `nx`          → Nx MCP (`npx nx-mcp@latest`)

## Key tools available via MCP
- `angular-cli`: generate components, services, guards, pipes, directives, routes, specs
- `nx`: workspace graph, affected projects, project details, run targets

## Workspace layout
```
platforms/           → Framework workspaces (each with own node_modules)
  angular/           → Angular ~21 (main framework, Elements catalog)
  react/             → React POC (hero Web Component)
  svelte/            → Svelte POC (hero Web Component)
  vanilla/           → Vanilla JS POC (hero Web Component)
vitals/              → Shared agnostic packages (consumed via tsconfig paths)
  contracts/         → Pure TS interfaces (element taxonomy, CMS contracts)
  core/              → Agnostic utilities, mappers, bridge protocol
  core-assets/       → SCSS design tokens, mixins, typography
  shared/            → Constants, validators, test utilities
tools/               → Interactive CLI (`npm run cli`)
```

## Quick reference
- Stack: Angular ~21, Nx 22, TypeScript ~5.9, SCSS (Sass modules), Vitest
- Multi-framework: Angular (main) + React, Svelte, Vanilla (POCs)
- Agnostic aliases: `@synergos/contracts`, `@synergos/core`, `@synergos/shared`
- Angular aliases: `@synergos/core` → `libs/core/`, `@synergos/shared` → `libs/shared/`, etc.
- Component prefix: `syn-`
- State: `signal()` only — no BehaviorSubject, no Zone.js
- Build output: CDN deployment (no local wwwroot)
- Full rules: see `LLM.txt`
