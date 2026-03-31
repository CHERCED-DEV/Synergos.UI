# Synergos UI — Architecture

## Overview

Synergos UI is a **multi-framework monorepo** that produces independently deployable Web Components consumed by Umbraco CMS via a local CDN.

```
synergos/
├── cms/        → Umbraco CMS (Razor host, layout, routing)
├── api/        → .NET REST APIs
└── ui/         → This repository (multi-framework monorepo)
```

Angular is the primary framework (full element catalog). React, Svelte, and Vanilla serve as alternative implementations for selected elements.

---

## Three-Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│  Layer 3 · Feature Architecture                     │
│  Business domains (appointments, services, ...)     │
├─────────────────────────────────────────────────────┤
│  Layer 2 · Design System                            │
│  Primitives → Compositions → Modules                │
├─────────────────────────────────────────────────────┤
│  Layer 1 · Foundations                              │
│  Core config, providers, infrastructure             │
└─────────────────────────────────────────────────────┘
```

### Layer 1 — Foundations

Two levels:

**Agnostic (`vitals/`)** — shared across all frameworks:
- `vitals/contracts` — pure TypeScript interfaces, element registry
- `vitals/core` — logger, mappers, bridge protocol, environment
- `vitals/shared` — utility functions, Vite base build config
- `vitals/core-assets` — SCSS design tokens (source of truth)

**Framework-specific (`platforms/*/libs/`)** — extends vitals with framework features:
- Angular: `libs/core/` (providers, interceptors, tokens), `libs/shared/` (components, directives, pipes), `libs/rendering/` (ElementRegistry, ComponentResolver)
- React/Svelte: `libs/core/` and `libs/shared/` re-export from vitals with framework-specific wrappers

### Layer 2 — Design System

Element hierarchy (replaces atomic design naming):

| Tier | Purpose | Examples |
|------|---------|---------|
| **Primitive** | Smallest building blocks | `button`, `text-block`, `image-block`, `badge`, `icon-block` |
| **Composition** | Grouped primitives forming a unit | `card`, `pricing-card`, `accordion`, `cta-group`, `feature-item` |
| **Module** | Full sections with layout and logic | `hero`, `feature-grid`, `faq-section`, `testimonial-section` |

### Layer 3 — Feature Architecture (`modules/`)

Business features as independent modules (Git submodules). Each module:
- Owns its own state
- Contains containers + presentational components
- Exports a mount function for CDN consumption
- Can evolve into an independent microfrontend

---

## Repository Structure

```
Synergos.UI/
├── platforms/
│   ├── angular/                   → Primary framework
│   │   ├── apps/elements/         → Angular Elements (Web Components)
│   │   │   ├── primitives/        → button, text-block, image-block, ...
│   │   │   ├── compositions/      → card, media-text, cta-group, ...
│   │   │   └── modules/           → hero, banner, feature-grid, ...
│   │   ├── libs/
│   │   │   ├── core/              → Angular providers, interceptors, tokens
│   │   │   ├── shared/            → Angular components (foundations/, components/, patterns/)
│   │   │   ├── core-assets/       → SCSS tokens (Angular copy)
│   │   │   ├── rendering/         → ElementRegistry, ComponentResolver, InputMapper
│   │   │   └── integrations/      → CMS sync tooling
│   │   └── modules/               → Business feature modules (Git submodules)
│   │
│   ├── react/                     → React Web Components
│   │   ├── apps/elements/         → pricing-card, stat-counter
│   │   └── libs/                  → core, shared, core-assets (re-exports)
│   │
│   ├── svelte/                    → Svelte Web Components
│   │   ├── apps/elements/         → accordion, avatar
│   │   └── libs/                  → core, shared, core-assets (re-exports)
│   │
│   └── vanilla/                   → Vanilla JS Web Components
│       └── apps/elements/         → hello-world (template)
│
├── vitals/                        → Agnostic packages (all frameworks)
│   ├── contracts/                 → Interfaces, element-registry.json
│   ├── core/                      → Logger, mappers, bridge, environment
│   ├── core-assets/               → SCSS design tokens (source of truth)
│   └── shared/                    → Utilities, Vite base config
│
├── tools/                         → CLI, publish, clean scripts
└── SynergosDocs/                  → This documentation
```

---

## Dependency Rules

Dependencies flow strictly **inward**:

```
Feature module
  → can depend on: shared, core, core-assets

libs/shared
  → can depend on: core, core-assets

libs/core
  → depends on nothing inside this repo

vitals packages
  → depend on nothing (pure, agnostic)
```

Cross-framework rule: **frameworks never depend on each other**. All shared logic lives in `vitals/`.

---

## Data Flow

```
Container (state, services)
  └── Module (layout, composition)
        └── Composition (grouped elements)
              └── Primitive (atomic element)
```

Components never call APIs directly. Containers orchestrate services.

---

## Multi-Framework Model

### How it works

Every element produces a `synergos-*` Custom Element (Web Component). The CMS doesn't know or care which framework built it — it just loads a `<script>` and uses the tag:

```html
<script src="/synergos/hero/angular/latest/main.js"></script>
<synergos-hero data-config='{"title":"Welcome"}'></synergos-hero>
```

### Framework selection criteria

| Angular (primary) | React/Svelte/Vanilla |
|---|---|
| Full element catalog | Selected elements only |
| Complex interactions, state | Lightweight, self-contained |
| CMS integration features | Performance-critical widgets |
| Business modules | Cross-team adoption |

### Shared build infrastructure

React, Svelte, and Vanilla share a Vite base config (`vitals/shared/src/build/vite-base.ts`) that produces IIFE bundles. Angular uses its own `@angular/build:application` executor.

---

## Production Deployment

```
npm run release
  ├── npm run build              → Compile all frameworks
  ├── node tools/publish.mjs     → Copy to CDN, generate manifests
  └── --clean                    → Remove ephemeral dist/ dirs
        ↓
  C:\LOCAL_CDN\synergos\<element>\<framework>\latest\main.js
        ↓
  Umbraco Razor partial loads <script> from CDN
        ↓
  Custom Element bootstraps on DOM
```

---

## Tech Stack

| Technology | Version | Notes |
|---|---|---|
| Angular | ~21.1 | Zoneless, Standalone, Signals, OnPush |
| React | 19 | Selected elements |
| Svelte | 5 | Selected elements |
| Nx | 22.5 | Dual-workspace model |
| TypeScript | ~5.9 | Strict mode |
| SCSS | Sass modules | `@use`/`@forward` only |
| Vitest | latest | Unit tests (all frameworks) |
| Vite | 6.x | Build tool (React, Svelte, Vanilla) |

---

## Related Documents

- [NX_GOVERNANCE.md](NX_GOVERNANCE.md) — Dual Nx model, project naming, tag strategy
- [OUTPUT_POLICY.md](OUTPUT_POLICY.md) — Build artifacts, CDN structure, cleanup
- [BUILD_PIPELINE.md](BUILD_PIPELINE.md) — Build, test, lint, publish commands
- [ONBOARDING.md](ONBOARDING.md) — Setup guide for new developers
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — SCSS tokens, component patterns
