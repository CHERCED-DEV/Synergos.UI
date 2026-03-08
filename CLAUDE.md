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

## Quick reference
- Stack: Angular ~21, Nx 22, TypeScript ~5.9, SCSS (Sass modules), Vitest, Cypress
- Lib aliases: `@synergos/core`, `@synergos/shared`, `@synergos/core-assets`
- Component prefix: `syn-`
- State: `signal()` only — no BehaviorSubject, no Zone.js
- Full rules: see `LLM.txt`
