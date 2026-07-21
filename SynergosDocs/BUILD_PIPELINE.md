# Build Pipeline

## Quick Reference

| Task | Command |
|------|---------|
| Build all | `npm run build` |
| Build Angular (elements + experiences) — **CDN mode** | `npm run build:angular` |
| **Build Angular shared runtime (once, then cache)** | **`npm run build:runtime`** |
| Build Angular fast (dev, no optimization) | `npm run build:angular:dev` |
| Build Angular stable/serial | `npm run build:angular:stable` |
| Build Angular changed projects only | `npm run build:angular:changed` |
| Build Angular elements only | `npm run build:angular:elements` |
| Build Angular experiences only | `npm run build:angular:experiences` |
| Build React (all) | `npm run build:react` |
| Build Svelte (all) | `npm run build:svelte` |
| Build Vanilla (all) | `npm run build:vanilla` |
| **Build all 6 cross-framework experiences** | **`npm run build:experiences:cross`** |
| Build all experiences (Angular + cross-framework) | `npm run build:experiences` |
| Generate manifests (preview) | `node tools/manifest-gen.mjs --dry-run` |
| Generate manifests to disk | `node tools/manifest-gen.mjs --out dist/manifests` |
| Validate contracts | `npm run contracts:validate` |
| Publish to CDN | `npm run publish:cdn` |
| Full release | `npm run release` |
| Release all experiences | `npm run release:experiences` |
| Clean element dists | `npm run clean:dist` |
| Interactive CLI | `npm run cli` |

---

## Build

### Framework builds

```bash
# All frameworks (sequential)
npm run build

# Single framework
npm run build:react
npm run build:svelte
npm run build:vanilla

# Cross-framework experiences only (React + Svelte + Vanilla, parallel=6)
npm run build:experiences:cross

# All experiences (Angular + cross-framework)
npm run build:experiences
```

### Angular builds

```bash
# 1. Fast dev iteration — no optimization (3-4× faster, NOT for release)
npm run build:angular:dev

# 2. Incremental — only projects affected by your changes
npm run build:angular:changed

# 3. Elements only — skip experiences
npm run build:angular:elements

# 4. Full production catalog (elements + experiences, optimization on)
npm run build:angular

# 5. Serial fallback — use only when debugging parallel build flakiness
npm run build:angular:stable

# Angular experiences only
npm run build:angular:experiences
```

### Single project builds

```bash
# Angular element or experience (from platforms/angular/)
cd platforms/angular
unset NX_WORKSPACE_ROOT_PATH
npx nx run experiences-feature-journey:build
npx nx run experiences-insight-explorer:build

# Cross-framework experiences
npx nx run react-content-carousel:build
npx nx run react-quiz-flow:build
npx nx run svelte-rating-widget:build
npx nx run svelte-filter-board:build
npx nx run vanilla-notification-stack:build
npx nx run vanilla-countdown-clock:build

# Composition elements
npx nx run react-pricing-card:build
npx nx run svelte-accordion:build
```

> **Important:** Angular Nx commands require `unset NX_WORKSPACE_ROOT_PATH` to prevent the root daemon from overriding workspace discovery. See `NX_GOVERNANCE.md` for details.

---

## Angular CDN Runtime

The **production Angular build is CDN mode by default** — Angular and shared libs are loaded **once** from a shared runtime bundle; each element bundle contains only element-specific code (~5–15 KB).

```
CDN mode (default):  runtime (loaded once, cached) ≈ 230 KB + each element ≈ 5–10 KB  ✅
Self-contained:      each element = Angular runtime + shared libs + element code ≈ 130–200 KB
```

**Typical CMS page** (5–10 elements): ~280 KB total vs 750–1 500 KB → **60–80% smaller**.

```bash
# Step 1 — build the shared runtime (once; repeat when Angular or shared libs change)
npm run build:runtime

# Step 2 — build all element bundles (lightweight, Angular externalized)
npm run build:angular

# Preview what the runtime build will produce (no files written)
npm run build:runtime:dry
```

The runtime produces `dist/runtime/angular/{version}/` with 11 bundles:

| File | Contents |
|------|----------|
| `ng-core.js` | `@angular/core` (self-contained) |
| `ng-compiler.js` | `@angular/compiler` (JIT linker) |
| `ng-common.js` | `@angular/common` |
| `ng-common-http.js` | `@angular/common/http` |
| `ng-elements.js` | `@angular/elements` |
| `ng-forms.js` | `@angular/forms` |
| `ng-platform-browser.js` | `@angular/platform-browser` |
| `ng-router.js` | `@angular/router` |
| `rxjs.js` | `rxjs` + `rxjs/operators` |
| `sg-core.js` | `@synergos/core` |
| `sg-shared.js` | `@synergos/shared` (all design system components) |

It also writes `import-map.json` — inject into the CMS page `<head>` before any element `<script>` tags:

```html
<head>
  <script type="importmap">
  {
    "imports": {
      "@angular/core":             "https://synergos-static-local/synergos/runtime/angular/21.x.x/ng-core.js",
      "@angular/compiler":         "https://synergos-static-local/synergos/runtime/angular/21.x.x/ng-compiler.js",
      "@angular/common":           "https://synergos-static-local/synergos/runtime/angular/21.x.x/ng-common.js",
      "@angular/common/http":      "https://synergos-static-local/synergos/runtime/angular/21.x.x/ng-common-http.js",
      "@angular/elements":         "https://synergos-static-local/synergos/runtime/angular/21.x.x/ng-elements.js",
      "@angular/forms":            "https://synergos-static-local/synergos/runtime/angular/21.x.x/ng-forms.js",
      "@angular/platform-browser": "https://synergos-static-local/synergos/runtime/angular/21.x.x/ng-platform-browser.js",
      "@angular/router":           "https://synergos-static-local/synergos/runtime/angular/21.x.x/ng-router.js",
      "rxjs":                      "https://synergos-static-local/synergos/runtime/angular/21.x.x/rxjs.js",
      "rxjs/operators":            "https://synergos-static-local/synergos/runtime/angular/21.x.x/rxjs.js",
      "@synergos/core":            "https://synergos-static-local/synergos/runtime/angular/21.x.x/sg-core.js",
      "@synergos/shared":          "https://synergos-static-local/synergos/runtime/angular/21.x.x/sg-shared.js"
    }
  }
  </script>
  <!-- Angular element bundles load AFTER the import map -->
  <script type="module" src="https://synergos-static-local/synergos/hero/angular/latest/main.js" defer></script>
</head>
```

See [CDN_RUNTIME.md](CDN_RUNTIME.md) for full runtime documentation and troubleshooting.

---

## Cross-Framework Experience Runtime

React, Svelte, and Vanilla experiences build as **self-contained IIFE bundles**. No shared runtime, no import map required — each bundle includes everything it needs.

```
project.json → env: { ELEMENT_NAME, ELEMENT_ENTRY }
                ↓
        vite.config.ts (merges createElementBuildConfig + framework plugin)
                ↓
        dist/<element>/main.js  (IIFE, self-contained)
```

Bundle sizes:

| Experience | Framework | Raw | gz |
|---|---|---|---|
| `synergos-content-carousel` | React | ~580 KB | ~180 KB |
| `synergos-quiz-flow` | React | ~580 KB | ~179 KB |
| `synergos-rating-widget` | Svelte | ~48 KB | ~15 KB |
| `synergos-filter-board` | Svelte | ~48 KB | ~15 KB |
| `synergos-notification-stack` | Vanilla | ~8 KB | ~3 KB |
| `synergos-countdown-clock` | Vanilla | ~8 KB | ~3 KB |

React bundles include React 19 (~50 KB gz). Svelte includes the Svelte 5 runtime. Vanilla is bare.

CMS loads them as plain `<script>` tags (no import map needed):

```html
<script src="https://cdn.example.com/synergos/quiz-flow/react/latest/main.js"></script>
<synergos-quiz-flow config='{"title":"Quiz","questions":[]}'></synergos-quiz-flow>
```

### Choosing the right Angular command

| Scenario | Command | Why |
|----------|---------|-----|
| Iterating locally on one element | `build:angular:dev` | Skips optimization — 3–4× faster. Never deploy these. |
| Day-to-day (multiple elements changed) | `build:angular:changed` | Nx affected graph. Fastest once cache is warm. |
| Element-only work | `build:angular:elements` | Excludes experience apps. |
| CI / release | `build:runtime && build:angular` | Lightweight elements (~5–10 KB). |
| Debugging a flaky parallel build | `build:angular:stable` | Serial (`--parallel=1`). |

**Rule of thumb:**
- Local dev → `build:angular:dev`
- Committing → `build:angular:changed`
- CI / release → `build:runtime` then `build:angular`

---

## Publish

```bash
# Default publish (all frameworks, all elements)
node tools/publish.mjs

# Custom CDN path
node tools/publish.mjs --cdn D:\MyCDN

# Preview without copying
node tools/publish.mjs --dry-run

# Single element (any framework)
node tools/publish.mjs --element quiz-flow

# Single framework
node tools/publish.mjs --framework react

# With version
node tools/publish.mjs --version 0.2.0

# Auto-clean after publish
node tools/publish.mjs --clean
```

### publish.mjs flags

| Flag | Description |
|------|-------------|
| `--cdn <path>` | CDN root directory (default: `$SYNERGOS_CDN` or `C:\LOCAL_CDN`) |
| `--version <ver>` | Version string for manifests (default: `0.1.0`) |
| `--dry-run` | Preview what would be published without copying files |
| `--element <name>` | Publish only a specific element by name |
| `--framework <name>` | Publish only a specific framework |
| `--clean` | Clean element dist directories after successful publish |

### CDN structure

```
C:\LOCAL_CDN\synergos\
├── <element-name>\
│   ├── <framework>\
│   │   ├── 0.1.0\          → immutable versioned slot
│   │   │   ├── main.js
│   │   │   └── manifest.json
│   │   ├── v0\             → major-pinned slot (updated per patch)
│   │   │   ├── main.js
│   │   │   └── manifest.json
│   │   └── latest\         → latest slot (dev/staging)
│   │       ├── main.js
│   │       └── manifest.json
├── registry.json            → global index of all published elements
└── contracts.json           → CMS CI contract validation file
```

---

## Manifest Generation

Each published element has a `manifest.json` that declares its public API (tag, tier, version, inputs). Generated automatically during `publish.mjs`:

```bash
# Preview manifests for all elements (no files written)
node tools/manifest-gen.mjs --dry-run

# Write manifests to dist/manifests/
node tools/manifest-gen.mjs --out dist/manifests

# Single element, single framework
node tools/manifest-gen.mjs --element quiz-flow --framework react

# CI validation: fail if any element has no declared inputs
node tools/manifest-gen.mjs --validate
```

Input descriptors live in `vitals/contracts/src/element-inputs.json`.

---

## Release

```bash
npm run release
```

This runs:
1. `npm run build` — builds all frameworks
2. `npm run contracts:validate` — **gate: fails if registry/models/inputs are out of sync**
3. `npm run publish:runtime` — publishes Angular runtime bundles + import-map.json
4. `node tools/publish.mjs --clean` — publishes element + experience bundles (with manifests) and cleans dists

### Contract validation gate

```bash
# Run both checks in sequence:
npm run contracts:validate

# Run individually:
npm run element:audit      # registry ↔ mapper ↔ models ↔ inputs (64/64)
npm run manifest:validate  # fail if any element has empty inputs array
```

The gate runs **after build, before publish**. Fix → re-run gate → publish.

---

## Clean

```bash
npm run clean:dist
```

Removes only element-specific dist directories. Angular's `dist/libs/` is preserved.

---

## Test & Lint

```bash
# All frameworks
npm run test
npm run lint

# Per framework
npm run test:angular
npm run test:react
npm run test:svelte
npm run lint:angular
npm run lint:react
npm run lint:svelte

# Single project
npx nx run react-quiz-flow:test
npx nx run svelte-rating-widget:lint
npx nx run vanilla-countdown-clock:build
```

### Test infrastructure

| Framework | Runner | Config |
|-----------|--------|--------|
| Angular | `@angular/build:unit-test` (Vitest) | `platforms/angular/vitest.config.mts` |
| React | Vitest + jsdom + @testing-library/react | `platforms/react/vitest.config.ts` |
| Svelte | Vitest + jsdom + @sveltejs/vite-plugin-svelte | `platforms/svelte/vitest.config.ts` |
| Vanilla | Vitest + jsdom | `platforms/vanilla/vitest.config.ts` |

---

## Verification Checklist

After a release, verify:

1. Angular elements: `ls C:\LOCAL_CDN\synergos\hero\angular\latest\main.js`
2. React experiences: `ls C:\LOCAL_CDN\synergos\quiz-flow\react\latest\main.js`
3. Svelte experiences: `ls C:\LOCAL_CDN\synergos\rating-widget\svelte\latest\main.js`
4. Vanilla experiences: `ls C:\LOCAL_CDN\synergos\countdown-clock\vanilla\latest\main.js`
5. Manifest is valid: `cat C:\LOCAL_CDN\synergos\<element>\<framework>\latest\manifest.json` — must include `inputs` array
6. Registry is current: `cat C:\LOCAL_CDN\synergos\registry.json` — check `generated` timestamp
7. Workspace is clean: `platforms/*/dist/` contains no element dirs (only Angular libs)
