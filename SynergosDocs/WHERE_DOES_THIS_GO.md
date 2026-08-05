> ⚠️ **DESACTUALIZADO desde la purga de plataformas (2026-08-04).** El árbol de decisión
> todavía enruta hacia `platforms/react|svelte|vanilla`, que no existen. Hoy la respuesta
> es siempre `platforms/angular/` — ver `ARCHITECTURE.md` para dónde dentro de él.

# Where Does This Go?

Decision tree for placing new code in Synergos UI.

---

## Start here

```
Is it a TypeScript type / interface that describes data?
  ├─ Is it CMS-agnostic (no Umbraco / property aliases)?
  │     → vitals/contracts/src/elements.contract.ts
  │       or shared.contract.ts / compositions.contract.ts
  │
  └─ Does it reference Umbraco property aliases or API shapes?
        → platforms/angular/libs/core/src/contracts/

Is it a runtime utility / pure function (no framework, no HTTP)?
  ├─ Related to CMS-to-component data transformation?
  │     → vitals/core/src/mappers/
  ├─ Related to bridge / cross-framework interop?
  │     → vitals/core/src/bridge/
  ├─ Build-time Vite config shared across React/Svelte/Vanilla?
  │     → vitals/shared/src/build/
  └─ Generic runtime helper (classNames, validators, constants)?
        → vitals/shared/src/utils/

Is it SCSS design tokens, mixins, or typography?
  → vitals/core-assets/src/scss/   (source of truth)
    mirrors to: platforms/angular/libs/core-assets/src/scss/

Is it Angular-specific?
  ├─ A reusable design system component (not a Web Component)?
  │     ├─ Single-responsibility, stateless?
  │     │     → platforms/angular/libs/shared/src/components/foundations/
  │     ├─ Composed component with interaction state?
  │     │     → platforms/angular/libs/shared/src/components/
  │     └─ Recurring UI layout pattern (2–4 components)?
  │           → platforms/angular/libs/shared/src/components/patterns/
  │
  ├─ A provider, token, interceptor, guard, or angular service?
  │     → platforms/angular/libs/core/src/
  │
  ├─ A connection between the rendering engine and elements?
  │     → platforms/angular/libs/rendering/src/
  │       (ElementRegistry, ComponentResolver, ElementMounter, InputMapper)
  │
  ├─ A CMS sync tool (C# → TS generator, property alias reader)?
  │     → platforms/angular/libs/integrations/src/
  │
  └─ A feature (appointments, e-commerce, services)?
        → platforms/angular/modules/<feature-name>/

Is it a Web Component (Custom Element for CDN)?
  ├─ Angular implementation?
  │     → platforms/angular/apps/elements/<tier>/<name>/src/
  │         e.g. platforms/angular/apps/elements/modules/hero/src/
  │
  ├─ React implementation?
  │     → platforms/react/apps/elements/<tier>/<name>/src/
  │
  ├─ Svelte implementation?
  │     → platforms/svelte/apps/elements/<tier>/<name>/src/
  │
  └─ Vanilla implementation?
        → platforms/vanilla/apps/elements/<tier>/<name>/src/

Is it a build/publish/tooling script?
  → tools/
    Existing: cli.mjs, publish.mjs, clean-dist.mjs, manifest-gen.mjs, catalog.mjs
    New scripts must be standalone .mjs files — no cross-script imports

Is it architectural documentation?
  → SynergosDocs/
    New docs: use kebab-case filenames
    Update: SynergosDocs/ index if one exists
```

---

## Quick reference table

| What you have | Where it goes |
|---------------|--------------|
| `interface HeroElementData` | `vitals/contracts/src/elements.contract.ts` |
| `interface UmbracoPageResponse` | `platforms/angular/libs/core/src/contracts/` |
| `function mapHeroBlock(block) {...}` | `vitals/core/src/mappers/` |
| `export const SPACING_TOKENS` | `vitals/shared/src/utils/` |
| `$color-brand-500`, spacing tokens | `vitals/core-assets/src/scss/tokens/` |
| `syn-button.ts` (Angular design system) | `platforms/angular/libs/shared/src/components/foundations/` |
| `provideHttp()` Angular provider | `platforms/angular/libs/core/src/` |
| `ElementMounter` service | `platforms/angular/libs/rendering/src/engines/` |
| `synergos-hero` Angular element | `platforms/angular/apps/elements/modules/hero/src/` |
| `synergos-hero` React element | `platforms/react/apps/elements/modules/hero/src/` |
| New publish/build script | `tools/` |
| Architecture decision | `SynergosDocs/` |

---

## The rule you should never forget

**Import direction is always inward — toward lower-level layers.**

```
modules  →  libs/shared  →  libs/core  →  vitals/*
```

If your import goes the other direction (e.g., `libs/core` importing from `libs/shared`), you have the wrong location. Move the code to the layer it actually belongs to.

---

## Scope boundaries (enforced by ESLint)

| If you're in... | You can import from... | You cannot import from... |
|-----------------|------------------------|--------------------------|
| `scope:elements` | `scope:libs`, `scope:vitals` | `scope:rendering`, `scope:integrations` |
| `scope:cms-adapter` | anything | — |
| `scope:rendering` | `scope:libs`, `scope:vitals` | `scope:elements`, `scope:integrations` |
| `scope:libs` | `scope:vitals` | `scope:elements`, `scope:rendering` |
| `scope:vitals` | nothing | everything else |

`scope:elements` are **pure UI components** — they must never know the rendering engine exists.  
Only `scope:cms-adapter` (i.e., `macro-host`) bridges the rendering boundary.

---

## Before adding a new vitals/ package

`vitals/` already covers:

- `vitals/contracts` — types and registry
- `vitals/core` — mappers, bridge, logger
- `vitals/core-assets` — SCSS tokens
- `vitals/shared` — runtime utils + Vite base config

Ask before creating a new vitals package:
> "Can this live in one of the four existing packages?"

Most things can. A new top-level vitals package needs explicit architectural justification.

---

## Registering a new element

Every new Custom Element MUST be registered in `vitals/contracts/src/element-registry.json` before any code is written. Format:

```json
{ "name": "my-element", "alias": "elementCompMyElement", "tag": "synergos-my-element", "tier": "composition" }
```

After adding it to the registry, add its inputs to `vitals/contracts/src/element-inputs.json`.
