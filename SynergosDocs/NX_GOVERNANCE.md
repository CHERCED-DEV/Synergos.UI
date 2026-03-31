# Nx Governance

## Dual-Workspace Model

Synergos UI uses two Nx workspaces deliberately:

```
Root Nx (nx.json)                     Angular Nx (platforms/angular/nx.json)
├── react-* projects                  ├── 38+ Angular projects
├── svelte-* projects                 ├── @angular/build:application
├── vanilla-* projects                ├── @angular/build:ng-packagr
├── vitals packages (agnostic)        ├── @angular/build:unit-test
├── nx:run-commands (generic)         └── Angular-specific generators
└── .nxignore → platforms/angular/
```

### Why Angular has its own Nx

Angular requires `@angular/build` executors (`application`, `ng-packagr`, `unit-test`) which depend on 30+ packages (`@angular/compiler-cli`, `zone.js`, `ng-packagr`, etc.). These must NOT contaminate the root workspace.

React, Svelte, and Vanilla use the generic `nx:run-commands` executor, which delegates to Vite. They don't need framework-specific Nx plugins and are governed from root.

### .nxignore

The file `.nxignore` at the workspace root excludes `platforms/angular/` from root Nx project discovery, preventing duplicate project names and executor resolution failures.

```
# .nxignore
platforms/angular/
```

---

## Project Naming

Projects are prefixed by framework to avoid collisions in root Nx:

| Framework | Prefix | Example |
|-----------|--------|---------|
| React | `react-` | `react-pricing-card` |
| Svelte | `svelte-` | `svelte-accordion` |
| Vanilla | `vanilla-` | `vanilla-hello-world` |
| Agnostic | (none) | `core`, `contracts`, `shared` |

Angular projects live in their own Nx workspace and don't need prefixes.

---

## Tag Strategy

Every project.json must include these tags:

| Tag | Purpose | Values |
|-----|---------|--------|
| `framework:` | Framework identity | `angular`, `react`, `svelte`, `vanilla`, `agnostic` |
| `scope:` | Domain scope | `elements`, `libs`, `vitals` |
| `tier:` | Element hierarchy | `primitive`, `composition`, `module` |
| `type:` | Project type | `app`, `lib` |
| `element:` | Element name | `hero`, `pricing-card`, etc. |

Tags enable targeted commands:

```bash
# Build all React elements
npx nx run-many --target=build --projects=tag:framework:react

# Test all compositions
npx nx run-many --target=test --projects=tag:tier:composition
```

---

## Target Defaults (nx.json)

```json
{
  "targetDefaults": {
    "build": { "dependsOn": ["^build"], "cache": true },
    "test": { "cache": true },
    "lint": { "cache": true }
  }
}
```

- `build` depends on upstream (`^build`) so libraries build before apps.
- `test` and `lint` are independently cacheable.

---

## Cache

- Cache lives in `.nx/cache/` (gitignored, auto-regenerated).
- Root `.nx/` is the only valid cache location. Platform-level `.nx/` directories are orphaned artifacts and should be deleted.
- Run `npx nx reset` to clear cache and restart the daemon if discovery behaves unexpectedly.

---

## Running Commands

| Scope | Command |
|-------|---------|
| All frameworks | `npm run build` |
| Single framework | `npm run build:react` |
| Single project | `npx nx run react-pricing-card:build` |
| Angular projects | `cd platforms/angular && npx nx run-many --target=build` |
| Nx graph (root) | `npm run graph` |
| Nx graph (Angular) | `npm run graph:angular` |
