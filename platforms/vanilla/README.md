# Synergos UI — Vanilla Platform

## Status

Template — minimal Custom Element using zero-framework native APIs.

## Elements

| Element | Tier | Tag |
|---------|------|-----|
| hello-world | primitive | `synergos-hello-world` |

## Structure

```
platforms/vanilla/
├── apps/elements/
│   └── primitives/
│       └── hello-world/     → synergos-hello-world (template element)
├── vite.config.ts           → Shared base (no framework plugin)
├── tsconfig.json            → Extends root tsconfig.base.json
└── package.json             → Vite only
```

## Commands

```bash
# Build all Vanilla elements
npm run build:vanilla

# Build single element
npx nx run vanilla-hello-world:build
```

## Creating a new element

1. Create directory: `apps/elements/<tier>/<element-name>/src/`
2. Create `main.ts` — Custom Element class extending HTMLElement with Shadow DOM
3. Create `<element-name>.ts` — Render function (pure DOM manipulation)
4. Create `project.json` with `vanilla-<element-name>` as project name
5. Add to `vitals/contracts/src/element-registry.json`
6. Build: `npx nx run vanilla-<element-name>:build`

## When to use Vanilla

- Simple elements with no reactive state (badges, dividers, spacers)
- Performance-critical widgets where framework overhead matters
- Reference implementation to understand the Custom Element API without framework abstractions
