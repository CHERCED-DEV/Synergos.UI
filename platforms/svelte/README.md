# Synergos UI — Svelte Platform

## Status

POC — selected elements implemented as Svelte-based Web Components.

## Elements

| Element | Tier | Tag |
|---------|------|-----|
| accordion | composition | `synergos-accordion` |
| avatar | primitive | `synergos-avatar` |

## Structure

```
platforms/svelte/
├── apps/elements/
│   ├── compositions/
│   │   └── accordion/       → synergos-accordion
│   └── primitives/
│       └── avatar/          → synergos-avatar
├── libs/
│   ├── core/                → Re-exports from vitals/core
│   ├── shared/              → Re-exports from vitals/shared
│   └── core-assets/         → Re-exports from vitals/core-assets
├── vite.config.ts           → Shared base + Svelte plugin (customElement: true)
├── vitest.config.ts         → Test config (jsdom)
├── eslint.config.mjs        → Lint config (typescript-eslint)
├── tsconfig.json            → Extends root tsconfig.base.json
└── package.json             → Svelte-specific dependencies
```

## Commands

```bash
# Build all Svelte elements
npm run build:svelte

# Build single element
npx nx run svelte-accordion:build

# Test
npm run test:svelte

# Lint
npm run lint:svelte
```

## Creating a new element

1. Create directory: `apps/elements/<tier>/<element-name>/src/`
2. Create `main.ts` — Custom Element registration via Svelte's `customElement: true` compiler option
3. Create `<ElementName>.svelte` — Svelte component with `<svelte:options customElement="synergos-<name>" />`
4. Create `project.json` with `svelte-<element-name>` as project name
5. Add to `vitals/contracts/src/element-registry.json`
6. Build: `npx nx run svelte-<element-name>:build`
