# Synergos UI — Architecture

## Overview

Synergos UI is the frontend layer of the Synergos platform. It is an **Nx monorepo** built with Angular 21 that delivers decoupled, independently deployable widgets consumed by Umbraco CMS.

```
synergos/
├── cms/        → Umbraco CMS (Razor host, layout, routing)
├── api/        → .NET REST APIs
└── ui/         → This repository (Angular Nx monorepo)
```

---

## Three-Layer Architecture

The frontend is structured in three conceptual layers:

```
┌─────────────────────────────────────────────────────┐
│  Layer 3 · Feature Architecture                     │
│  Business domains (appointments, services, ...)     │
├─────────────────────────────────────────────────────┤
│  Layer 2 · Design System                            │
│  Atoms → Molecules → Organisms                      │
├─────────────────────────────────────────────────────┤
│  Layer 1 · Foundations                              │
│  Core config, providers, infrastructure             │
└─────────────────────────────────────────────────────┘
```

### Layer 1 — Foundations (`libs/core`)

Technical infrastructure shared by every application and module.

- Global Angular providers (`provideCoreConfig`)
- HTTP interceptors (auth, error, loading)
- Environment configuration (`ENVIRONMENT` token)
- Infrastructure services (LoggerService, ...)
- Injection tokens

### Layer 2 — Design System (`libs/shared` + `libs/core-assets`)

Reusable UI building blocks following **atomic design**.

- `libs/core-assets` → design tokens, SCSS system
- `libs/shared` → Angular components, pipes, directives
  - `atoms/` → smallest UI primitives (Button, Badge, Icon, ...)
  - `molecules/` → composed UI (FormField, SearchBar, Card, ...)
  - `organisms/` → complex sections (Header, DataTable, Modal, ...)

### Layer 3 — Feature Architecture (`modules/`)

Business features as independent modules. Each module:

- Owns its own state
- Contains containers + presentational components
- Exports `mountModule(selector, config)` for CDN consumption
- Can evolve into an independent microfrontend

---

## Repository Structure

```
synergos-ui/
├── apps/
│   ├── shell/           # Dev harness — simulates Umbraco host
│   └── shell-e2e/       # Cypress E2E tests
│
├── libs/
│   ├── core/            # Layer 1: Foundations
│   │   └── src/
│   │       ├── core.environment.ts
│   │       ├── core.providers.ts
│   │       ├── core.tokens.ts
│   │       ├── interceptors/
│   │       └── services/
│   │
│   ├── shared/          # Layer 2: Design System (Angular)
│   │   └── src/
│   │       ├── atoms/
│   │       ├── molecules/
│   │       ├── organisms/
│   │       ├── directives/
│   │       ├── pipes/
│   │       └── utils/
│   │
│   └── core-assets/     # Layer 2: Design System (SCSS)
│       └── src/
│           └── scss/
│               ├── tokens/      (colors, spacing, typography, breakpoints)
│               ├── elevation/   (shadows, z-index)
│               ├── mixins/      (responsive, flex, typography)
│               ├── typography/  (font face, type scale)
│               └── colors/      (CSS custom properties)
│
├── modules/             # Layer 3: Feature modules (Git submodules)
│   ├── appointments/
│   ├── services/
│   └── ...
│
└── SynergosDocs/        # Architectural documentation
```

---

## Dependency Rules

Dependencies flow strictly **inward** (outer layers depend on inner, never the reverse):

```
Feature module
  → can depend on: shared, core, core-assets

libs/shared
  → can depend on: core, core-assets

libs/core
  → depends on nothing inside this repo

libs/core-assets
  → depends on nothing inside this repo
```

**Circular dependencies are forbidden.**

---

## Data Flow

State and data flow strictly **downward**:

```
Container (state, services)
  └── Organism (layout, composition)
        └── Molecule (grouped elements)
              └── Atom (primitive element)
```

Components never call APIs. Only containers orchestrate services.

---

## Production Deployment

```
Build pipeline → dist/apps/<module>/browser/
                     ↓
                   CDN upload
                     ↓
           Umbraco Razor partial loads bundle
                     ↓
           mountModule('#selector', config)
                     ↓
           Angular bootstraps on DOM element
```

The `shell` app is **never deployed to production**. It is a development tool only.

---

## Tech Stack

| Technology | Version | Notes |
|---|---|---|
| Angular | ~21.1 | Zoneless, Standalone, Signals |
| Nx | 22.5 | Monorepo tooling |
| TypeScript | ~5.9 | Strict mode |
| SCSS | Sass modules | `@use`/`@forward` only |
| Vitest | latest | Unit tests |
| Cypress | latest | E2E tests |

