# Onboarding Guide

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 22+ | `node -v` |
| npm | 10+ | `npm -v` |
| Git | 2.40+ | `git --version` |

---

## Setup

```bash
# 1. Clone the repository
git clone <repo-url> Synergos.UI
cd Synergos.UI

# 2. Install root dependencies (Nx, CLI tools)
npm install

# 3. Install all platform dependencies
npm run setup
```

This installs `node_modules/` for each platform independently (Angular, React, Svelte, Vanilla). There are no npm workspaces — each platform manages its own dependencies.

---

## First Build

```bash
# Build all frameworks
npm run build

# Or use the interactive CLI
npm run cli
```

---

## Project Structure at a Glance

```
Synergos.UI/
├── platforms/
│   ├── angular/         → Main framework (Angular Elements catalog + experiences)
│   │   ├── apps/elements/      → ~50 Web Components (primitives, compositions, modules)
│   │   └── apps/experiences/   → feature-journey, insight-explorer, media-explorer
│   ├── react/           → React experiences
│   │   └── apps/experiences/   → content-carousel, quiz-flow
│   ├── svelte/          → Svelte experiences
│   │   └── apps/experiences/   → rating-widget, filter-board
│   └── vanilla/         → Vanilla JS experiences
│       └── apps/experiences/   → notification-stack, countdown-clock
├── vitals/
│   ├── contracts/       → Pure TS interfaces, element-registry.json
│   ├── core/            → Agnostic utilities, logger, mappers, bridge
│   ├── core-assets/     → SCSS design tokens (source of truth)
│   └── shared/          → Shared utilities, Vite base config
├── tools/
│   ├── cli.mjs          → Interactive CLI
│   ├── publish.mjs      → CDN publish script (multi-framework)
│   ├── build-runtime.mjs → Angular shared runtime builder
│   └── publish-runtime.mjs → Angular runtime CDN publisher
└── SynergosDocs/        → Architecture & operations documentation
```

---

## How Frameworks Connect

All frameworks consume the same agnostic packages via TypeScript path aliases:

```
@synergos/contracts  → vitals/contracts/src/index.ts   (interfaces, registry)
@synergos/core       → platform-local libs/core         (logger + vitals re-exports)
@synergos/shared     → platform-local libs/shared       (utilities + framework extras)
```

Angular overrides `@synergos/core` and `@synergos/shared` to point to its own `libs/` which re-export and extend the vitals packages with Angular-specific providers and components.

React/Svelte/Vanilla use platform-specific `libs/` that re-export from `vitals/` and add framework-idiomatic wrappers (e.g., `useLogger` hook for React).

---

## Element Tiers

| Tier | Scope | Purpose | Examples |
|------|-------|---------|---------|
| **primitive** | elements | Smallest building blocks | `button`, `text-block`, `image-block`, `badge` |
| **composition** | elements | Groups of primitives forming a unit | `card`, `pricing-card`, `accordion`, `cta-group` |
| **module** | elements | Full sections with layout and logic | `hero`, `feature-grid`, `faq-section` |
| **experience** | experiences | Complex interactive widgets | `quiz-flow`, `rating-widget`, `countdown-clock` |

---

## Creating a New Element

### 1. Register the element

Add an entry to `vitals/contracts/src/element-registry.json`:

```json
{ "name": "my-widget", "alias": "elementCompMyWidget", "tag": "synergos-my-widget", "tier": "composition" }
```

### 2. Create the element in a framework

```
platforms/<framework>/apps/elements/<tier>/<element-name>/
├── project.json       → Nx project definition
└── src/
    ├── main.ts(x)     → Custom Element registration
    └── my-widget.ts(x) → Component implementation
```

### 3. project.json tags

```json
["scope:elements", "tier:composition", "type:app", "element:my-widget", "framework:<framework>"]
```

### 4. Build and verify

```bash
npx nx run <framework>-my-widget:build
node tools/publish.mjs --element my-widget --dry-run
```

---

## Creating a New Experience

Experiences are complex interactive widgets with their own state, multi-step flows, or timers. They follow a 4-layer architecture inside every framework.

### Framework assignment rule

Check [`EXPERIENCES.md`](EXPERIENCES.md) first. **Each experience lives in exactly one framework.** Do not duplicate an experience that already exists.

### 1. Register in the agnostic layer

```bash
# Add to vitals/contracts/src/element-registry.json
{ "name": "my-exp", "alias": "experienceMyExp", "tag": "synergos-my-exp", "tier": "module" }

# Add to vitals/contracts/src/element-inputs.json
"my-exp": [{ "name": "config", "type": "json", "required": false }]

# Add to vitals/contracts/src/element-config.contract.ts
# (interface + ELEMENT_CONFIG_FIELDS entry + ElementConfigMap entry)

# Add model + mapper to vitals/core/src/models/ and vitals/core/src/mappers/
# Export from both index.ts files
# Add to REGISTRY in block.mapper.ts
```

### 2. Validate contracts

```bash
npm run element:audit
# Must show: Contract audit passed.
```

### 3. Create the framework project

```
platforms/<framework>/apps/experiences/<exp-name>/
├── project.json   → tags: [scope:experiences, tier:module, framework:<fw>]
└── src/
    ├── main.ts(x)       → Custom Element registration
    └── <exp-name>/
        ├── index.ts      → re-export from interface
        ├── domain/       → types, pure functions
        ├── application/  → state (hooks / class / runes)
        ├── infrastructure/ → config interface + adapter
        └── interface/    → UI component
```

See [`EXPERIENCES.md`](EXPERIENCES.md) for full examples per framework.

---

## Key Documents

| Document | What it covers |
|----------|---------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, layers, dependency rules |
| [EXPERIENCES.md](EXPERIENCES.md) | All 9 experiences, architecture per framework, creation guide |
| [NX_GOVERNANCE.md](NX_GOVERNANCE.md) | Dual Nx model, project naming, tags |
| [BUILD_PIPELINE.md](BUILD_PIPELINE.md) | Build, test, lint, publish commands |
| [SCRIPTS.md](SCRIPTS.md) | npm scripts quick reference |
| [OUTPUT_POLICY.md](OUTPUT_POLICY.md) | Build artifacts, CDN structure, cleanup |
| [CDN_RUNTIME.md](CDN_RUNTIME.md) | Angular shared runtime, import map |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | SCSS tokens, component patterns |
