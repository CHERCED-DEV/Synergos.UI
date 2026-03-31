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
│   ├── angular/         → Main framework (Angular Elements catalog)
│   ├── react/           → React Web Components (POC)
│   ├── svelte/          → Svelte Web Components (POC)
│   └── vanilla/         → Vanilla JS Web Components (template)
├── vitals/
│   ├── contracts/       → Pure TS interfaces, element-registry.json
│   ├── core/            → Agnostic utilities, logger, mappers, bridge
│   ├── core-assets/     → SCSS design tokens (source of truth)
│   └── shared/          → Shared utilities, Vite base config
├── tools/
│   ├── cli.mjs          → Interactive CLI
│   ├── publish.mjs      → CDN publish script
│   └── clean-dist.mjs   → Build cleanup script
└── SynergosDocs/        → Architecture & operations documentation
```

---

## How Frameworks Connect

All frameworks consume the same agnostic packages via TypeScript path aliases:

```
@synergos/contracts  → vitals/contracts/src/index.ts   (interfaces, registry)
@synergos/core       → vitals/core/src/index.ts        (logger, mappers, bridge)
@synergos/shared     → vitals/shared/src/index.ts      (utilities, Vite config)
```

Angular overrides `@synergos/core` and `@synergos/shared` to point to its own `libs/` which re-export and extend the vitals packages with Angular-specific providers.

---

## Creating a New Element

### 1. Register the element

Add an entry to `vitals/contracts/src/element-registry.json`:

```json
{ "name": "my-widget", "alias": "elementCompMyWidget", "tag": "synergos-my-widget", "tier": "composition" }
```

### 2. Create the element in a framework

Follow the directory convention:

```
platforms/<framework>/apps/elements/<tier>/<element-name>/
├── project.json       → Nx project definition
└── src/
    ├── main.ts(x)     → Custom Element registration (entry point)
    └── my-widget.ts(x) → Component implementation
```

### 3. Create the project.json

Use the framework naming convention:

```json
{
  "name": "<framework>-my-widget",
  "projectType": "application",
  "tags": ["scope:elements", "tier:composition", "type:app", "element:my-widget", "framework:<framework>"],
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "outputs": ["{workspaceRoot}/platforms/<framework>/dist/my-widget"],
      "options": {
        "command": "npx vite build",
        "cwd": "platforms/<framework>",
        "env": {
          "ELEMENT_NAME": "my-widget",
          "ELEMENT_ENTRY": "apps/elements/compositions/my-widget/src/main.ts"
        }
      }
    }
  }
}
```

### 4. Build and verify

```bash
npx nx run <framework>-my-widget:build
node tools/publish.mjs --element my-widget
```

---

## Element Tiers

| Tier | Purpose | Examples |
|------|---------|---------|
| **primitive** | Smallest building blocks, no composition | `button`, `text-block`, `image-block`, `badge` |
| **composition** | Groups of primitives forming a unit | `card`, `pricing-card`, `accordion`, `cta-group` |
| **module** | Full sections with layout and logic | `hero`, `feature-grid`, `faq-section` |

---

## Key Documents

| Document | What it covers |
|----------|---------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, layers, dependency rules |
| [NX_GOVERNANCE.md](NX_GOVERNANCE.md) | Dual Nx model, project naming, tags |
| [OUTPUT_POLICY.md](OUTPUT_POLICY.md) | Build artifacts, CDN structure, cleanup |
| [BUILD_PIPELINE.md](BUILD_PIPELINE.md) | Build, test, lint, publish commands |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | SCSS tokens, component patterns |
