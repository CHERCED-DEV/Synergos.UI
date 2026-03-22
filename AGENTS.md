# Synergos UI — Codex Agent Config

## Governance
All code generation MUST follow `LLM.txt` in the workspace root.
Architecture documentation is in `SynergosDocs/` — read the relevant doc before generating code.

## Stack
- Angular ~21 (Zoneless, Standalone, Signals, OnPush everywhere)
- Nx 22.5.4 monorepo
- TypeScript ~5.9 (strict, private fields `#`)
- SCSS with Sass modules (`@use` / `@forward`, never `@import`)
- Vitest for unit tests, Cypress for E2E

## Project structure
```
apps/shell/          → dev harness (not deployed)
libs/core/           → providers, tokens, interceptors, services
libs/shared/         → components/(foundations/ + patterns/), directives/, pipes/, utils/
libs/core-assets/    → SCSS design tokens and mixins
modules/             → feature modules (Git submodules)
SynergosDocs/        → architecture docs
LLM.txt              → full AI governance rules
```

## Key rules (summary — full rules in LLM.txt)
- `standalone: true` + `ChangeDetectionStrategy.OnPush` on every component
- `input()` / `output()` — never `@Input()` / `@Output()`
- `signal()` for all state — never `BehaviorSubject`
- `inject()` — never constructor injection
- Design system files: no `.component.ts` suffix → `button.ts`, `card.ts`, `data-grid.ts`
- Feature files: `feature.container.ts`, `feature.store.ts`, `feature.api.ts`
- `@synergos/core` imports allowed from: `libs/shared`, `modules/*`
- `@synergos/shared` imports allowed from: `modules/*` only
- No circular dependencies

## Scaffolding
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
