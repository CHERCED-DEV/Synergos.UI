# Build Pipeline

## Quick Reference

| Task | Command |
|------|---------|
| Build all | `npm run build` |
| Build Angular | `npm run build:angular` |
| Build React | `npm run build:react` |
| Build Svelte | `npm run build:svelte` |
| Build Vanilla | `npm run build:vanilla` |
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

# Single framework
npm run build:react

# Single element
npx nx run react-pricing-card:build
```

### How builds work

React, Svelte, and Vanilla use a shared Vite base config (`vitals/shared/src/build/vite-base.ts`) that reads `ELEMENT_NAME` and `ELEMENT_ENTRY` env vars from each project.json:

```
project.json → env: { ELEMENT_NAME, ELEMENT_ENTRY }
                ↓
          vite.config.ts (merges shared base + framework plugin)
                ↓
          dist/<element>/main.js (IIFE bundle, ~2-20 KB)
```

Angular uses its own build system (`@angular/build:application`) managed from `platforms/angular/`.

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

## Release

The release command is a full build + publish + clean cycle:

```bash
npm run release
```

This runs:
1. `npm run build` — builds all frameworks
2. `node tools/publish.mjs --clean` — publishes to CDN and cleans element dists

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
2. Registry is current: `cat C:\LOCAL_CDN\synergos\registry.json`
3. Workspace is clean: `platforms/*/dist/` contains no element dirs (only Angular libs)
4. Bundles load: open an HTML file that includes a `<script src="...main.js">` and test the Custom Element
