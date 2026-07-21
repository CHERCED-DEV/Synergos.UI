# Synergos UI — Codex Agent Config

## Governance
All code generation MUST follow `LLM.txt` in the workspace root.
Architecture documentation is in `SynergosDocs/` — read the relevant doc before generating code.

## Stack
- Multi-framework: Angular ~21 (main) + React, Svelte, Vanilla (POCs)
- Nx 22.5.4 monorepo orchestrator
- TypeScript ~5.9 (strict, private fields `#`)
- SCSS with Sass modules (`@use` / `@forward`, never `@import`)
- Vitest for unit tests

## Project structure
```
platforms/
  angular/             → Main framework (Angular Elements catalog)
    apps/elements/     → Web Components (primitives/, compositions/, modules/)
    libs/core/         → Angular providers, tokens, interceptors, services
    libs/shared/       → Angular design system (foundations/, components/, patterns/)
    libs/core-assets/  → SCSS design tokens and mixins
    libs/rendering/    → ElementRegistry, ComponentResolver, InputMapper
    libs/integrations/ → CMS sync tooling
    modules/           → Feature modules (Git submodules)
  react/               → React POC (hero Web Component)
  svelte/              → Svelte POC (hero Web Component)
  vanilla/             → Vanilla JS POC (hero Web Component)
vitals/
  contracts/           → Pure TS interfaces (element taxonomy, CMS contracts)
  core/                → Agnostic utilities, mappers, bridge protocol
  core-assets/         → SCSS design tokens (source of truth)
  shared/              → Constants, validators, test utilities
tools/                 → Interactive CLI (npm run cli)
SynergosDocs/          → Architecture docs
LLM.txt                → Full AI governance rules
```

## Key rules (summary — full rules in LLM.txt)
- `standalone: true` + `ChangeDetectionStrategy.OnPush` on every component
- `input()` / `output()` — never `@Input()` / `@Output()`
- `signal()` for all state — never `BehaviorSubject`
- `inject()` — never constructor injection
- Design system files: no `.component.ts` suffix → `button.ts`, `card.ts`, `data-grid.ts`
- Feature files: `feature.container.ts`, `feature.store.ts`, `feature.api.ts`
- Agnostic packages (vitals/) shared via tsconfig paths, NOT npm
- Each framework has own node_modules/ — NO npm workspaces
- vitals/ NEVER imports from any framework
- No circular dependencies

## Scaffolding (run from platforms/angular/)
```bash
# New foundation
npx nx g @nx/angular:component button --project=shared --path=libs/shared/src/components/foundations

# New component
npx nx g @nx/angular:component card --project=shared --path=libs/shared/src/components

# New pattern
npx nx g @nx/angular:component data-grid --project=shared --path=libs/shared/src/components/patterns

# New feature module
npx nx g @nx/angular:app appointments --directory=modules
```

## Build commands (from root)
```bash
npm run cli                    # Interactive CLI
npm run build:angular          # Build all Angular elements
npm run build:react            # Build React POC
npm run build:svelte           # Build Svelte POC
npm run build:vanilla          # Build Vanilla POC
```
