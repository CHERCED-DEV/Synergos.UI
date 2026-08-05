# Synergos UI — Architecture

## Overview

Synergos UI produces independently deployable Web Components consumed by Umbraco CMS via CDN.

```
synergos/
├── cms/        → Umbraco CMS (Razor host, layout, routing)
├── api/        → .NET REST APIs
└── ui/         → This repository
```

**Angular first.** Todo el catálogo se construye en Angular, y es la única
plataforma que vive en el repo desde la purga del 2026-08-04: `platforms/react`,
`platforms/svelte` y `platforms/vanilla` se eliminaron con sus experiencias.

Lo que **no** cambió es la superficie de acople: el CMS carga un `<script>` y usa
una etiqueta `<synergos-*>`, y el segmento de framework sigue en la ruta del CDN
(`/synergos/<el>/angular/<slot>/main.js`). Ese diseño se conserva a propósito —
si un cliente pide una funcionalidad que ya existe en otro framework, empalmarla
es publicar bajo otro segmento, no rehacer el contrato. Hoy el único valor vivo
es `angular`.

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

**Agnostic (`vitals/`)** — sin dependencias de framework:
- `vitals/contracts` — pure TypeScript interfaces, element registry, config contracts
- `vitals/core` — logger, mappers, bridge protocol, environment
- `vitals/core-assets` — SCSS design tokens (source of truth)

> `vitals/shared` ya no existe: era la config base de Vite para las plataformas
> IIFE, y se fue con ellas.

**Angular (`platforms/angular/libs/`)** — extiende vitals:
- `libs/core/` — providers, interceptors, tokens
- `libs/shared/` — components, directives, pipes (foundations/, components/, patterns/)
- `libs/rendering/` — ElementRegistry, ComponentResolver, InputMapper
- `libs/integrations/` — CMS sync tooling
- `libs/shells/`, `libs/shop/`, `libs/transaction-engine/` — dominio

### Layer 2 — Design System

Element hierarchy:

| Tier | Purpose | Examples |
|------|---------|---------|
| **Primitive** | Smallest building blocks | `button`, `text-block`, `image-block`, `badge`, `icon-block` |
| **Composition** | Grouped primitives forming a unit | `card`, `pricing-card`, `accordion`, `cta-group` |
| **Module** | Full sections with layout and logic | `hero`, `feature-grid`, `faq-section`, `banner-slider` |

> **El registry sólo conoce esos tres tiers**, y el presupuesto de tamaño tiene un
> techo por cada uno (issue #8). Las **experiencias** —`feature-journey`,
> `insight-explorer`, `media-explorer`— viven en `apps/experiences/` y entran al
> registry como `module`, no como un cuarto tier.

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
│   └── angular/                   → la única plataforma
│       ├── apps/elements/         → Angular Elements (Web Components)
│       │   ├── primitives/        → button, text-block, image-block, ...   (27)
│       │   ├── compositions/      → card, media-text, cta-group, ...       (45)
│       │   └── modules/           → hero, banner, feature-grid, ...        (53)
│       ├── apps/experiences/      → feature-journey, insight-explorer, media-explorer
│       ├── apps/domains/          → shop/ (product-card, cart-summary, variant-picker, ...)
│       ├── libs/
│       │   ├── core/              → providers, interceptors, tokens
│       │   ├── shared/            → components (foundations/, components/, patterns/)
│       │   ├── rendering/         → ElementRegistry, ComponentResolver, InputMapper
│       │   ├── integrations/      → CMS sync tooling
│       │   └── shells/ shop/ transaction-engine/
│       ├── modules/               → Business feature modules (Git submodules)
│       └── tools/                 → build.mjs, build-specs.mjs, ngtsc.mjs, sync-tokens.mjs
│
├── vitals/                        → Paquetes agnósticos
│   ├── contracts/                 → Interfaces, element-registry.json, element-inputs.json
│   ├── core/                      → Logger, mappers, bridge, environment
│   └── core-assets/               → SCSS design tokens (source of truth)
│
├── tools/                         → build-cdn, publish, build-runtime, dev-cdn, humo-cdn, gates
├── worker/ + wrangler.jsonc       → Cloudflare Workers: sirve public/ con caché y CORS
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

La regla de agnosticismo sobrevive a la purga y no es decorativa: lo compartido
vive en `vitals/`, sin imports de framework. Es lo que hace que empalmar otra
plataforma siga siendo posible sin desenredar el design system.

---

## Experience Architecture Pattern

Cada experiencia sigue la misma estructura de 4 capas:

```
src/<experience-name>/
├── domain/           → Pure types, constants, business rules (no framework deps)
├── application/      → Business logic, state management (Angular signals)
├── infrastructure/   → Config interfaces, adapter functions (CMS → domain model)
└── interface/        → UI component
```

El detalle por capa está en [FEATURE_ARCHITECTURE.md](FEATURE_ARCHITECTURE.md).
`EXPERIENCES.md` lleva banner: su catálogo todavía enumera experiencias de las
plataformas eliminadas.

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

## El acople con el CMS

Cada elemento produce un Custom Element `synergos-*`. El CMS no sabe qué lo
construyó — carga un `<script>` y usa la etiqueta:

```html
<script type="module" src="/synergos/hero/angular/latest/main.js"></script>
<synergos-hero config='{"title":"Welcome"}'></synergos-hero>
```

El bundle es **ESM**, no autocontenido: Angular y las libs compartidas se
resuelven desde el **runtime compartido** (11 bundles) vía import map, que el CMS
inyecta *inline* en el `<head>`. Por eso cada elemento pesa ~5-15 KB en vez de
arrastrar el framework entero. Ver [CDN_RUNTIME.md](CDN_RUNTIME.md).

> El segmento `angular` de la ruta es el punto de extensión que deja el diseño
> multi-framework: publicar el mismo nombre bajo otro segmento no toca el
> contrato ni el CMS. Hoy no hay ninguno.

---

## Production Deployment

```
npm run build:cdn                 → arma public/ entero, y es lo que despliega Cloudflare
  ├── build:vitals + build:angular  → los elementos (un NgtscProgram, un esbuild)
  ├── build:runtime                 → el runtime compartido + import-map.json
  ├── publish-runtime.mjs           → PRIMERO el runtime: lo que depende de él va después
  ├── publish.mjs                   → los elementos y el registry
  └── check-size-budget.mjs         → el presupuesto de tamaño (issue #8)
        ↓
  public/synergos/<element>/angular/{latest|v0|<versión>}/main.js
        ↓
  Cloudflare Workers lo sirve (worker/index.js pone caché y CORS)
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
| TypeScript | ~5.9 | Strict mode |
| esbuild | ^0.27 | El bundler, invocado desde `tools/build.mjs` (no hay Vite, no hay Nx) |
| ngtsc | de Angular | AOT — compila elementos **y specs**, ver `tools/ngtsc.mjs` |
| SCSS | Sass ^1.97 | `@use`/`@forward` only |
| Vitest | ^4.0 | Unit tests, sobre los specs ya compilados AOT |
| Wrangler | 4.118.0 | Pineado (issue #4) — sirve `public/` en Cloudflare Workers |

---

## Related Documents

- [BUILD_PIPELINE.md](BUILD_PIPELINE.md) — Build, test, lint, publish
- [SCRIPTS.md](SCRIPTS.md) — La tabla de scripts npm, post-purga
- [CDN_RUNTIME.md](CDN_RUNTIME.md) — Runtime compartido, import map
- [DEV_CDN_MODE.md](DEV_CDN_MODE.md) — El ciclo editor→navegador
- [ELEMENT_CONTRACT.md](ELEMENT_CONTRACT.md) — El contrato con el CMS
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — SCSS tokens, component patterns
- [FEATURE_ARCHITECTURE.md](FEATURE_ARCHITECTURE.md) — Módulos y experiencias, capa por capa

> Los que llevan banner (`EXPERIENCES`, `ONBOARDING`, `OUTPUT_POLICY`,
> `NX_GOVERNANCE`, `WHERE_DOES_THIS_GO`, y las dos auditorías) describen el repo
> anterior a la purga. Están para consultar el porqué, no el cómo.
