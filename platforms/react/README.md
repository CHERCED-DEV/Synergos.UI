# Synergos UI — React Platform

## Status

POC — selected elements implemented as React-based Web Components.

## Elements

| Element | Tier | Tag |
|---------|------|-----|
| pricing-card | composition | `synergos-pricing-card` |
| stat-counter | composition | `synergos-stat-counter` |

## Structure

```
platforms/react/
├── apps/elements/
│   └── compositions/
│       ├── pricing-card/    → synergos-pricing-card
│       └── stat-counter/    → synergos-stat-counter
├── libs/
│   ├── core/                → Re-exports from vitals/core
│   ├── shared/              → Re-exports from vitals/shared
│   └── core-assets/         → Re-exports from vitals/core-assets
├── vite.config.ts           → Shared base + React plugin
├── vitest.config.ts         → Test config (jsdom)
├── eslint.config.mjs        → Lint config (typescript-eslint)
├── tsconfig.json            → Extends root tsconfig.base.json
└── package.json             → React-specific dependencies
```

## Commands

```bash
# Build all React elements
npm run build:react

# Build single element
npx nx run react-pricing-card:build

# Test
npm run test:react

# Lint
npm run lint:react
```

## Creating a new element

1. Create directory: `apps/elements/<tier>/<element-name>/src/`
2. Create `main.tsx` — Custom Element class with Shadow DOM + React root
3. Create `<element-name>.tsx` — React component
4. Create `project.json` with `react-<element-name>` as project name
5. Add to `vitals/contracts/src/element-registry.json`
6. Build: `npx nx run react-<element-name>:build`
