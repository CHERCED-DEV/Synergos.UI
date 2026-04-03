# Build Pipeline

## Quick Reference

| Task | Command |
|------|---------|
| Build all | `npm run build` |
| Build Angular (elements + experiences) — **lightweight, CDN mode** | `npm run build:angular` |
| **Build shared runtime (required once, then cache)** | **`npm run build:runtime`** |
| Build Angular fast (dev, no optimization) | `npm run build:angular:dev` |
| Build Angular stable/serial | `npm run build:angular:stable` |
| Build Angular changed projects only | `npm run build:angular:changed` |
| Build Angular elements only | `npm run build:angular:elements` |
| Build Angular experiences only | `npm run build:angular:experiences` |
| Build React | `npm run build:react` |
| Build Svelte | `npm run build:svelte` |
| Build Vanilla | `npm run build:vanilla` |
| Generate manifests (preview) | `node tools/manifest-gen.mjs --dry-run` |
| Generate manifests to disk | `node tools/manifest-gen.mjs --out dist/manifests` |
| Validate input declarations | `node tools/manifest-gen.mjs --validate` |
| Publish to CDN | `npm run publish:cdn` |
| Full release | `npm run release` |
| Clean element dists | `npm run clean:dist` |
| Interactive CLI | `npm run cli` |

---

## Build

Each framework builds independently:

```bash
# All frameworks (sequential)
npm run build

# Single framework (fast default)
npm run build:react

# Angular — production = lightweight CDN mode by default

# 1. Fast dev iteration — no optimization (3-4× faster, NOT for release)
npm run build:angular:dev

# 2. Incremental — only projects affected by your changes (fastest once cache is warm)
npm run build:angular:changed

# 3. Elements only — skip experiences (for element-focused work)
npm run build:angular:elements

# 4. Full production catalog (elements + experiences, optimization on)
npm run build:angular

# 5. Serial fallback — use only when debugging parallel build flakiness
npm run build:angular:stable

# Angular experiences only
npm run build:angular:experiences

# Single Angular experience or element (run from platforms/angular/)
cd platforms/angular
unset NX_WORKSPACE_ROOT_PATH && node_modules/.bin/nx run experiences-feature-journey:build
unset NX_WORKSPACE_ROOT_PATH && node_modules/.bin/nx run experiences-insight-explorer:build
unset NX_WORKSPACE_ROOT_PATH && node_modules/.bin/nx run experiences-media-explorer:build

# Build all experiences at once
unset NX_WORKSPACE_ROOT_PATH && node_modules/.bin/nx run-many --target=build --projects=tag:scope:experiences

# Cross-framework element
npx nx run react-pricing-card:build
```

> **Important:** Angular Nx commands require `unset NX_WORKSPACE_ROOT_PATH` to prevent the root daemon from overriding workspace discovery. See `NX_GOVERNANCE.md` for details.

### CDN Runtime mode (lightweight elements)

The **production build is CDN mode by default** — Angular and shared libs are loaded **once** from a shared runtime bundle, and each element bundle contains only element-specific code (~5–15 KB).

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

The runtime produces `dist/runtime/` with:

| File | Contents |
|------|----------|
| `ng-core.js` | `@angular/core` (self-contained) |
| `ng-common.js` | `@angular/common` |
| `ng-elements.js` | `@angular/elements` + rxjs |
| `ng-platform-browser.js` | `@angular/platform-browser` |
| `sg-core.js` | `@synergos/core` |
| `sg-shared.js` | `@synergos/shared` (all design system components) |

It also writes `dist/runtime/import-map.json` — inject this into the CMS page `<head>` before any element `<script>` tags:

```html
<head>
  <script type="importmap">
  {
    "imports": {
      "@angular/core":             "https://cdn.example.com/synergos/runtime/latest/ng-core.js",
      "@angular/common":           "https://cdn.example.com/synergos/runtime/latest/ng-common.js",
      "@angular/common/http":      "https://cdn.example.com/synergos/runtime/latest/ng-common.js",
      "@angular/elements":         "https://cdn.example.com/synergos/runtime/latest/ng-elements.js",
      "@angular/platform-browser": "https://cdn.example.com/synergos/runtime/latest/ng-platform-browser.js",
      "@synergos/core":            "https://cdn.example.com/synergos/runtime/latest/sg-core.js",
      "@synergos/shared":          "https://cdn.example.com/synergos/runtime/latest/sg-shared.js"
    }
  }
  </script>

  <!-- element bundles load AFTER the import map -->
  <script type="module" src="https://cdn.example.com/synergos/hero/angular/latest/main.js" defer></script>
  <script type="module" src="https://cdn.example.com/synergos/card/angular/latest/main.js" defer></script>
</head>
```

> **Browser support**: Import maps are supported by all modern browsers (Chrome 89+, Firefox 108+, Safari 16.4+). For Umbraco, generate the import map in a Razor partial and inject it into `<head>` as the first script.

### Choosing the right Angular build command

| Scenario | Command | Why |
|----------|---------|-----|
| Iterating on a single element locally | `build:angular:dev` | Skips optimization — 3-4× faster. Never deploy these. |
| Day-to-day work (multiple elements changed) | `build:angular:changed` | Nx affected graph. Fastest once the Nx cache is warm. |
| Element-only work (no experiences) | `build:angular:elements` | Excludes the 3 experience apps. |
| CI / release (requires import map in CMS) | `build:runtime && build:angular` | Lightweight elements (~5–10 KB). Default production mode. |
| Debugging a flaky parallel build | `build:angular:stable` | Serial (`--parallel=1`). |

**Rule of thumb:**
- Local dev → `build:angular:dev`
- Committing → `build:angular:changed`
- CI / release → `build:runtime` then `build:angular`
- Standalone / embed → `build:angular` (self-contained, no import map needed)

### How builds work

React, Svelte, and Vanilla use a shared Vite base config (`vitals/shared/src/build/vite-base.ts`) that reads `ELEMENT_NAME` and `ELEMENT_ENTRY` env vars from each project.json:

```
project.json → env: { ELEMENT_NAME, ELEMENT_ENTRY }
                ↓
          vite.config.ts (merges shared base + framework plugin)
                ↓
          dist/<element>/main.js (IIFE bundle, ~2-20 KB)
```

Angular uses its own build system (`@angular/build:application`) managed from `platforms/angular/`. Experiences build alongside elements — both are included in `npm run build:angular`.

---

## Publish

```bash
# Default publish
node tools/publish.mjs

# With custom CDN path
node tools/publish.mjs --cdn D:\MyCDN

# Preview without copying
node tools/publish.mjs --dry-run

# Single element
node tools/publish.mjs --element hero

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
| `--clean` | Clean element dist directories after successful publish |

---

## Manifest Generation

Each published element has a `manifest.json` that declares its public API (tag, tier, version, inputs).
Manifests are generated automatically during `publish.mjs` but can also be generated standalone:

```bash
# Preview manifests for all elements (no files written)
node tools/manifest-gen.mjs --dry-run

# Write manifests to dist/manifests/
node tools/manifest-gen.mjs --out dist/manifests

# Single element, single framework
node tools/manifest-gen.mjs --element hero --framework angular

# Pin version
node tools/manifest-gen.mjs --version 1.0.0

# CI validation: fail if any element has no declared inputs
node tools/manifest-gen.mjs --validate
```

Input descriptors live in `vitals/contracts/src/element-inputs.json`.
Full contract documentation: [ELEMENT_CONTRACT.md](./ELEMENT_CONTRACT.md)

---

## Release

The release command is a full build + validate + publish + clean cycle:

```bash
npm run release
```

This runs:
1. `npm run build` — builds all frameworks
2. `npm run contracts:validate` — **gate: fails if registry/models/inputs are out of sync**
3. `npm run publish:runtime` — publishes runtime bundles + import-map.json
4. `node tools/publish.mjs --clean` — publishes element bundles (with manifests) and cleans dists

Each CDN slot receives two files: `main.js` (bundle) and `manifest.json` (API contract).

### Contract validation gate

```bash
# Run both checks in sequence (used by all release scripts):
npm run contracts:validate

# Run individually:
npm run element:audit      # registry ↔ mapper ↔ models ↔ inputs consistency
npm run manifest:validate  # fail if any element has empty inputs array
```

The gate runs **after build, before publish**. A failed gate means the contracts are incomplete — the publish must not proceed until resolved. Fix the gap, re-run the gate, then publish.

---

## Clean

```bash
# Clean element dists only (preserves Angular libs)
npm run clean:dist
```

The clean script reads the element registry and removes only element-specific dist directories. Angular's `dist/libs/` is preserved because ng-packagr outputs are consumed during the Angular build.

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
npx nx run react-pricing-card:test
npx nx run svelte-accordion:lint
```

### Test infrastructure

| Framework | Runner | Config |
|-----------|--------|--------|
| Angular | `@angular/build:unit-test` (Vitest) | `platforms/angular/vitest.config.mts` |
| React | Vitest + jsdom + @testing-library/react | `platforms/react/vitest.config.ts` |
| Svelte | Vitest + jsdom + @sveltejs/vite-plugin-svelte | `platforms/svelte/vitest.config.ts` |

### Lint infrastructure

| Framework | Linter | Config |
|-----------|--------|--------|
| Angular | ESLint + angular-eslint | `platforms/angular/eslint.config.mjs` |
| React | ESLint + typescript-eslint | `platforms/react/eslint.config.mjs` |
| Svelte | ESLint + typescript-eslint | `platforms/svelte/eslint.config.mjs` |

---

## Verification Checklist

After a release, verify:

1. CDN files exist: `ls C:\LOCAL_CDN\synergos\<element>\<framework>\latest\main.js`
2. Manifest is valid: `cat C:\LOCAL_CDN\synergos\<element>\<framework>\latest\manifest.json` — must include `inputs` array
3. Versioned slot exists: `ls C:\LOCAL_CDN\synergos\<element>\<framework>\v{major}\main.js`
4. Registry is current: `cat C:\LOCAL_CDN\synergos\registry.json` — check `generated` timestamp and `elements[].implementations`
5. Workspace is clean: `platforms/*/dist/` contains no element dirs (only Angular libs)
6. Bundles load: open an HTML file that includes a `<script src="...main.js">` and test the Custom Element
