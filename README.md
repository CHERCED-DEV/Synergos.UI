# Synergos UI

Frontend platform for the **Synergos** ecosystem — a modular Angular workspace that delivers decoupled widgets consumed by Umbraco CMS.

```
synergos/
  cms/    → Umbraco CMS (host, Razor views)
  api/    → .NET Backend APIs
  ui/     → This repository (Angular + Nx)
```

---

## Architecture

```
synergos-ui/
├── apps/
│   ├── shell/           # Dev harness — simulates Umbraco host
│   └── shell-e2e/       # Cypress E2E for the shell
├── libs/
│   ├── core/            # Providers, tokens, environment config
│   ├── shared/          # Components, pipes, directives, utils
│   └── core-assets/     # Design tokens, SCSS system, typography
├── modules/             # Git submodules — independent business modules
│   ├── services/        # → @synergos/module-services (submodule)
│   ├── appointments/    # → @synergos/module-appointments (submodule)
│   └── ...
├── nx.json
├── tsconfig.json
└── package.json
```

### How it works in production

1. Each module is built independently → output goes to CDN
2. Umbraco Razor views load the CDN bundle via `<script type="module">`
3. The bundle exposes `mountModule(selector, config)` which bootstraps the Angular app onto a DOM element
4. The `shell` app is **only for local development** — it is never deployed

---

## Tech stack

| Tool | Version |
|---|---|
| Angular | ~21.1 (Zoneless, Standalone APIs, Signals) |
| Nx | 22.5 |
| TypeScript | ~5.9 |
| SCSS | Sass modules (`@use` / `@forward`) |
| Testing | Vitest + Cypress |

---

## Getting started

### Prerequisites
- Node.js ≥ 20
- npm ≥ 10

### Install

```bash
npm install
```

### Serve the shell (dev)

```bash
npm start
# or
npx nx serve shell
```

Open [http://localhost:4200](http://localhost:4200)

### Build

```bash
npm run build           # build shell only
npm run build:all       # build all projects
```

### Test

```bash
npm test                # test shell
npm run test:all        # test all projects
```

### Lint

```bash
npm run lint            # lint shell
npm run lint:all        # lint all projects
```

### Visualise the dependency graph

```bash
npm run graph
```

---

## Creating new projects

### New module (recommended: as a Git submodule)

```bash
# 1. Create a new repo for the module
# 2. Register as submodule
git submodule add <repo-url> modules/<name>
```

See [modules/README.md](modules/README.md) for the full module contract.

### New app inside the monorepo

```bash
npx nx g @nx/angular:app apps/<name>
# or use the shorthand script:
npm run g:app -- <name>
```

### New shared library

```bash
npx nx g @nx/angular:lib libs/<name>
# or:
npm run g:lib -- <name>
```

### New component inside a library

```bash
npx nx g @nx/angular:component <name> --project=<lib-name>
# or:
npm run g:component -- <name> --project=<lib-name>
```

---

## Libraries

### `@synergos/core`

Global configuration, providers, injection tokens, and environment types.

```typescript
import { provideCoreConfig } from '@synergos/core';
import { ENVIRONMENT } from '@synergos/core';

// In app.config.ts:
provideCoreConfig({ environment: { production: false, apiBaseUrl: '...' } })

// In a component/service:
readonly env = inject(ENVIRONMENT);
```

### `@synergos/shared`

Reusable utilities, pipes, directives, and components.

```typescript
import { classNames } from '@synergos/shared';

classNames('btn', isActive && 'btn--active') // → 'btn btn--active'
```

### `@synergos/core-assets`

Design tokens and SCSS system. Add `includePaths` to your project then use:

```json
// project.json → build → options
"stylePreprocessorOptions": {
  "includePaths": ["libs/core-assets/src"]
}
```

```scss
// In any SCSS file
@use 'scss' as syn;

.my-component {
  color: syn.$color-primary;
  font-size: syn.$font-size-lg;

  @include syn.flex-center;
  @include syn.respond-to('md') {
    padding: syn.$space-lg;
  }
}
```

Available tokens: `$color-*`, `$space-*`, `$font-size-*`, `$font-weight-*`, `$font-family-*`, `$bp-*`

Available mixins: `flex-center`, `flex-between`, `flex-column`, `respond-to($bp)`, `respond-below($bp)`, `heading($size)`, `text-truncate`, `text-clamp($lines)`

---

## Module contract

Every Synergos module must export:

```typescript
export interface ModuleConfig {
  apiBaseUrl: string;
  cdnBaseUrl?: string;
  locale?: string;
}

export function mountModule(selector: string, config: ModuleConfig): void;
```

---

## Deployment

Each module is an independent build unit:

```bash
# Build a specific module
npx nx build <module-name>

# Output → dist/apps/<module-name>/browser/
# Deploy this folder to CDN
```

CDN URL pattern: `https://cdn.example.com/synergos/<module>/<version>/main.js`

---

## Conventions

| Convention | Rule |
|---|---|
| File naming | `kebab-case` |
| Component selector prefix | `syn-` |
| Lib path alias | `@synergos/<lib-name>` |
| Change detection | `OnPush` everywhere |
| Zone.js | Disabled — use `provideZonelessChangeDetection()` |
| State | Angular Signals |
| Styles | SCSS with `@use` (no `@import`) |
| Exports | All public API through `src/index.ts` |

---

## Project tags (Nx module boundaries)

| Tag | Meaning |
|---|---|
| `scope:shell` | Shell app only |
| `scope:core` | Core infrastructure |
| `scope:shared` | Shared/reusable |
| `type:app` | Application |
| `type:lib` | Library |
| `type:e2e` | E2E test project |
| `type:assets` | Static assets / styles |
