# Synergos UI

Multi-framework Web Components platform for the **Synergos** ecosystem — delivers decoupled widgets consumed by Umbraco CMS via CDN.

```
synergos/
  cms/    → Umbraco CMS (host, Razor views)
  api/    → .NET Backend APIs
  ui/     → This repository (Multi-framework + Nx)
```

---

## Architecture

```
synergos-ui/
├── platforms/                # Framework workspaces (isolated node_modules)
│   ├── angular/              # Main framework — Angular Elements catalog
│   │   ├── apps/elements/    # Web Components (primitives/, compositions/, modules/)
│   │   ├── libs/core/        # Providers, tokens, environment config
│   │   ├── libs/shared/      # Design system (foundations/, components/, patterns/)
│   │   ├── libs/core-assets/ # SCSS tokens and mixins
│   │   ├── libs/rendering/   # ElementRegistry, ComponentResolver, InputMapper
│   │   ├── libs/integrations/# CMS sync tooling
│   │   └── modules/          # Git submodules (independent business modules)
│   ├── react/                # React POC (hero Web Component)
│   ├── svelte/               # Svelte POC (hero Web Component)
│   └── vanilla/              # Vanilla JS POC (hero Web Component)
├── vitals/                   # Agnostic packages (shared via tsconfig paths)
│   ├── contracts/            # Pure TS interfaces (element taxonomy, CMS contracts)
│   ├── core/                 # Agnostic utilities, mappers, bridge protocol
│   ├── core-assets/          # SCSS design tokens (source of truth)
│   └── shared/               # Constants, validators, test utilities
├── tools/                    # Interactive CLI
├── nx.json                   # Root Nx orchestrator
├── tsconfig.base.json        # Agnostic path aliases
└── package.json              # Root scripts + Nx
```

### How it works in production

1. Each element is built independently as a Custom Element (`synergos-*`)
2. Build output is deployed to CDN
3. Umbraco Razor views load the CDN bundle via `<script type="module">`
4. Multiple frameworks can produce the same element — CMS selects the implementation

### Dependency flow

```
vitals/contracts   → Pure interfaces (the WHAT)
       ↓
vitals/core        → Agnostic implementations (the HOW) + bridge protocol
       ↓
vitals/shared      → Utilities, constants, validators
       ↓
vitals/core-assets → SCSS tokens (the LOOK)
       ↓
┌────────┬───────┬────────┬─────────┐
│angular │ react │ svelte │ vanilla │  → Each consumes vitals/ above
└────────┴───────┴────────┴─────────┘
```

---

## Tech stack

| Tool | Version |
|---|---|
| Angular | ~21.1 (Zoneless, Standalone APIs, Signals) |
| React | 19 (POC) |
| Svelte | 5 (POC) |
| Nx | 22.5 |
| TypeScript | ~5.9 |
| SCSS | Sass modules (`@use` / `@forward`) |
| Testing | Vitest |

---

## Getting started

### Prerequisites
- Node.js >= 20
- npm >= 10

### Install all frameworks

```bash
npm run setup
```

Or install individually:

```bash
npm run setup:angular
npm run setup:react
npm run setup:svelte
npm run setup:vanilla
```

### Build

```bash
npm run build                # Build all frameworks
npm run build:angular        # Build Angular elements only
npm run build:react          # Build React POC
npm run build:svelte         # Build Svelte POC
npm run build:vanilla        # Build Vanilla POC
```

### Interactive CLI

```bash
npm run cli
# or
npm run c
```

Menu flow: Action > Framework > Tier > Elements > Execute

### Test & Lint

```bash
npm test                     # Test all
npm run lint                 # Lint all
```

### Dependency graph

```bash
npm run graph
```

---

## Agnostic packages (vitals/)

Shared via `tsconfig.base.json` path aliases — consumed directly from source, no npm linking:

| Package | Alias | Purpose |
|---|---|---|
| `vitals/contracts/` | `@synergos/contracts` | Pure TS interfaces, element taxonomy |
| `vitals/core/` | `@synergos/core` | Mappers, bridge protocol, utilities |
| `vitals/core-assets/` | — | SCSS design tokens, mixins |
| `vitals/shared/` | `@synergos/shared` | Constants, validators |

### SCSS usage

Each framework configures `includePaths` pointing to `vitals/core-assets/src`:

```scss
@use 'scss' as syn;

.my-component {
  color: syn.$color-primary;
  @include syn.flex-center;
}
```

---

## Angular libraries (platforms/angular/libs/)

| Library | Alias | Purpose |
|---|---|---|
| `libs/core/` | `@synergos/core` | Providers, tokens, environment, services |
| `libs/shared/` | `@synergos/shared` | Design system components |
| `libs/core-assets/` | `@synergos/core-assets` | SCSS tokens (Angular copy) |
| `libs/rendering/` | `@synergos/rendering` | Element rendering pipeline |
| `libs/integrations/` | `@synergos/integrations` | CMS sync tooling |

---

## Conventions

| Convention | Rule |
|---|---|
| File naming | `kebab-case` |
| Component selector prefix | `syn-` |
| Custom element tag | `synergos-<name>` |
| Change detection | `OnPush` everywhere |
| Zone.js | Disabled — `provideZonelessChangeDetection()` |
| State | Angular Signals |
| Styles | SCSS with `@use` (no `@import`) |
| Exports | All public API through `src/index.ts` |

---

## Project tags (Nx)

| Tag | Meaning |
|---|---|
| `framework:angular` | Angular workspace |
| `framework:react` | React workspace |
| `framework:svelte` | Svelte workspace |
| `framework:vanilla` | Vanilla JS workspace |
| `framework:agnostic` | Agnostic package (vitals/) |
| `scope:elements` | Element apps |
| `scope:core` | Core infrastructure |
| `scope:shared` | Shared/reusable |
| `scope:contracts` | TS interfaces |
| `scope:core-assets` | SCSS tokens |
| `tier:primitive` | Basic element |
| `tier:composition` | Composed element |
| `tier:module` | Full module element |
