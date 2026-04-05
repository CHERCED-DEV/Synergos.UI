# Synergos UI — Architecture

## Overview

Synergos UI is a **multi-framework monorepo** that produces independently deployable Web Components consumed by Umbraco CMS via a local CDN.

```
synergos/
├── cms/        → Umbraco CMS (Razor host, layout, routing)
├── api/        → .NET REST APIs
└── ui/         → This repository (multi-framework monorepo)
```

Angular is the primary framework (full element catalog + experiences). React, Svelte, and Vanilla produce **experiences** — complex interactive Custom Elements that are not present in Angular's catalog.

---

## Three-Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│  Layer 3 · Feature Architecture                     │
│  Business domains (appointments, services, ...)     │
├─────────────────────────────────────────────────────┤
│  Layer 2 · Design System                            │
│  Primitives → Compositions → Modules → Experiences  │
├─────────────────────────────────────────────────────┤
│  Layer 1 · Foundations                              │
│  Core config, providers, infrastructure             │
└─────────────────────────────────────────────────────┘
```

### Layer 1 — Foundations

Two levels:

**Agnostic (`vitals/`)** — shared across all frameworks:
- `vitals/contracts` — pure TypeScript interfaces, element registry, config contracts
- `vitals/core` — logger, mappers, bridge protocol, environment
- `vitals/shared` — utility functions, Vite base build config
- `vitals/core-assets` — SCSS design tokens (source of truth)

**Framework-specific (`platforms/*/libs/`)** — extends vitals with framework features:
- Angular: `libs/core/` (providers, interceptors, tokens), `libs/shared/` (components, directives, pipes), `libs/rendering/` (ElementRegistry, ComponentResolver)
- React: `libs/core/` (React hooks — `useLogger`, `createLogger`), `libs/shared/` (`Button`, `classNames`)
- Svelte: `libs/core/` (`createLogger`, Svelte store-based logger), `libs/shared/` (utilities)
- Vanilla: `libs/core/` (`createLogger`), `libs/shared/` (`classNames`)

### Layer 2 — Design System

Element hierarchy:

| Tier | Purpose | Frameworks | Examples |
|------|---------|-----------|---------|
| **Primitive** | Smallest building blocks | Angular | `button`, `text-block`, `image-block`, `badge`, `icon-block` |
| **Composition** | Grouped primitives forming a unit | Angular, React, Svelte | `card`, `pricing-card`, `accordion`, `cta-group` |
| **Module** | Full sections with layout and logic | Angular | `hero`, `feature-grid`, `faq-section`, `banner-slider` |
| **Experience** | Complex interactive widgets | Angular, React, Svelte, Vanilla | `feature-journey`, `quiz-flow`, `rating-widget`, `countdown-clock` |

> **Experiences are not duplicated across frameworks.** Each experience is owned by exactly one framework. Cross-framework experiences (React, Svelte, Vanilla) fill gaps not covered by Angular's catalog.

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
│   │   ├── apps/experiences/      → Angular Experiences
│   │   │   ├── feature-journey/   → 5-step interactive journey (signals-based)
│   │   │   ├── insight-explorer/  → Data exploration widget
│   │   │   └── media-explorer/    → Media browsing experience
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
│   │   ├── apps/experiences/      → Cross-framework experiences
│   │   │   ├── content-carousel/  → Sliding carousel with autoplay, dot nav
│   │   │   └── quiz-flow/         → Multi-phase quiz (intro→quiz→results)
│   │   └── libs/                  → core (useLogger, createLogger), shared (Button, classNames)
│   │
│   ├── svelte/                    → Svelte Web Components
│   │   ├── apps/elements/         → accordion, avatar
│   │   ├── apps/experiences/      → Cross-framework experiences
│   │   │   ├── rating-widget/     → Star rating with hover, submit, feedback
│   │   │   └── filter-board/      → Tag-filtered card grid with counts
│   │   └── libs/                  → core (createLogger), shared (classNames)
│   │
│   └── vanilla/                   → Vanilla JS Web Components
│       ├── apps/elements/         → hello-world (template)
│       ├── apps/experiences/      → Cross-framework experiences
│       │   ├── notification-stack/ → Observer-pattern notification stack
│       │   └── countdown-clock/   → Live countdown with setInterval
│       └── libs/                  → core (createLogger), shared (classNames)
│
├── vitals/                        → Agnostic packages (all frameworks)
│   ├── contracts/                 → Interfaces, element-registry.json, element-inputs.json
│   ├── core/                      → Logger, mappers, bridge, environment
│   ├── core-assets/               → SCSS design tokens (source of truth)
│   └── shared/                    → Utilities, Vite base config
│
├── tools/                         → CLI, publish, build-runtime, clean scripts
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

Experience rule: **no experience is duplicated across frameworks**. Angular owns feature-journey, insight-explorer, media-explorer. React owns content-carousel, quiz-flow. Svelte owns rating-widget, filter-board. Vanilla owns notification-stack, countdown-clock.

---

## Experience Architecture Pattern

Every experience — regardless of framework — follows the same 4-layer folder structure:

```
src/<experience-name>/
├── domain/           → Pure types, constants, business rules (no framework deps)
├── application/      → Business logic, state management (framework-idiomatic)
├── infrastructure/   → Config interfaces, adapter functions (CMS → domain model)
└── interface/        → UI component (Angular component, React FC, Svelte component, render fn)
```

This mirrors Angular's own experience architecture. See [EXPERIENCES.md](EXPERIENCES.md) for full detail.

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
<synergos-hero config='{"title":"Welcome"}'></synergos-hero>

<script src="/synergos/quiz-flow/react/latest/main.js"></script>
<synergos-quiz-flow config='{"title":"Test","questions":[...]}'></synergos-quiz-flow>
```

### Framework assignment

| Framework | Owns |
|---|---|
| **Angular** | Full element catalog (primitives, compositions, modules) + 3 angular experiences |
| **React** | `content-carousel`, `quiz-flow` |
| **Svelte** | `rating-widget`, `filter-board` |
| **Vanilla** | `notification-stack`, `countdown-clock` |

### Bundle model

| Framework | Format | Runtime strategy |
|---|---|---|
| Angular | ESM | Shared CDN runtime (11 bundles, loaded once via import map) |
| React | IIFE | Self-contained (includes React 19, ~180 KB gz) |
| Svelte | IIFE | Self-contained (includes Svelte runtime, ~15 KB gz) |
| Vanilla | IIFE | Self-contained (no framework, ~3 KB gz) |

### Shared build infrastructure

React, Svelte, and Vanilla share a Vite base config (`vitals/shared/src/build/vite-base.ts`) that produces IIFE bundles. Angular uses its own `@angular/build:application` executor with external deps and import map.

---

## Production Deployment

```
npm run release
  ├── npm run build               → Compile all frameworks
  ├── npm run contracts:validate  → Gate: registry ↔ mappers ↔ models ↔ inputs
  ├── npm run publish:runtime     → Publish Angular shared runtime + import-map.json
  └── node tools/publish.mjs --clean
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
| React | 19 | Experiences: content-carousel, quiz-flow |
| Svelte | 5 | Experiences: rating-widget, filter-board |
| Nx | 22.5 | Dual-workspace model (root + Angular) |
| TypeScript | ~5.9 | Strict mode |
| SCSS | Sass modules | `@use`/`@forward` only |
| Vitest | latest | Unit tests (all frameworks) |
| Vite | 6.x | Build tool (React, Svelte, Vanilla) |

---

## Related Documents

- [EXPERIENCES.md](EXPERIENCES.md) — Experiences layer: architecture, creation guide, all 9 experiences
- [NX_GOVERNANCE.md](NX_GOVERNANCE.md) — Dual Nx model, project naming, tag strategy
- [OUTPUT_POLICY.md](OUTPUT_POLICY.md) — Build artifacts, CDN structure, cleanup
- [BUILD_PIPELINE.md](BUILD_PIPELINE.md) — Build, test, lint, publish commands
- [ONBOARDING.md](ONBOARDING.md) — Setup guide for new developers
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — SCSS tokens, component patterns
- [CDN_RUNTIME.md](CDN_RUNTIME.md) — Angular shared CDN runtime, import map
