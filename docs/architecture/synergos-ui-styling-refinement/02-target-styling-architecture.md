# 02 Target Styling Architecture

## Objectives

- Root-driven theming, not component-local hardcoded theming.
- Semantic runtime tokens as the main contract between Umbraco and the UI.
- Component-local variables as the only place where component styling binds to the theme contract.
- Backward compatibility with legacy CMS overrides through `--sg-*` aliases.

## Proposed layers

### 1. Core tokens

- Primitive palette values: neutral, brand, accent, success, warning, danger.
- Foundational scales: spacing, radius, shadows, motion, typography.
- These remain in Sass for internal authoring discipline.

### 2. Semantic runtime tokens

Defined at `:root` or any themed container.

Core semantic groups:

- surfaces
- text
- borders
- overlays
- actions
- state colors
- focus rings
- elevation shadows
- hero/divider/action gradients

These are emitted as CSS variables and are the real runtime contract.

### 3. Legacy compatibility variables

- `--sg-*` remains available because CMS-side theme injection may already know those names.
- `--syn-*` semantic tokens are resolved from `--sg-*` where appropriate.
- This keeps migration incremental instead of forcing an immediate contract break.

### 4. Component-local tokens

Each component defines local variables such as:

- `--syn-button-*`
- `--syn-input-*`
- `--syn-card-*`
- `--syn-panel-*`
- `--syn-section-*`
- `--syn-hero-*`
- `--syn-banner-*`

These local variables map semantic system tokens into concrete component usage.

For shared-component composition, wrappers should pass intent through CSS variables instead of deep selector overrides, for example:

- composition defines `--syn-social-links-*` and `--syn-link-*` overrides
- shared primitive/pattern reads those variables with semantic fallbacks
- runtime theme still resolves at root/container level

## Theme scopes

The global theme contract supports these selectors:

- `:root`
- `:root[data-theme="..."]`
- `:root[theme="..."]`
- `[data-theme="..."]`
- `[theme="..."]`
- `.theme-*`

This allows both page-level and subtree-level theme activation.

## Theme strategy

### Light

- clean enterprise default
- cool neutral surfaces
- restrained brand emphasis
- soft elevated glass surfaces where appropriate

### Dark

- high-contrast enterprise dark
- layered slate surfaces
- restrained but visible brand lift
- stronger elevation and overlay behavior

### Silver Gold

- warm neutral surfaces
- graphite primary actions
- muted gold accent, never saturated gold-as-brand everywhere
- premium metallic language with controlled contrast and elevation

## Angular strategy

- Shared components consume semantic tokens directly.
- Component theme classes remain only as compatibility overrides when a component is themed locally instead of through root context.
- Compatibility selectors should cover both legacy local modifier classes and emitted `sg-*` host classes when Angular templates bind theme/layout through `hostClasses()`.
- For composition wrappers in migration, host class emission should be dual (`legacy` + `sg-*`) to preserve existing CSS hooks while converging to `sg-*` naming.
- When wrappers compose themed child patterns (for example FAQ + accordion), theme intent should also map to child visual tone APIs so dark and premium contexts do not render with default neutral styling.
- Wrapper templates should preserve semantic HTML structure (`ul/li`, landmark labels, meaningful loading semantics) so visual refinement does not degrade accessibility.
- Shared interactive compositions must generate collision-safe ARIA identifiers per instance (for example tabs) instead of static ids tied only to item keys.
- Form primitives should expose reachable state APIs (`invalid`, `hint`, `aria-describedby`) so error/hint styling is contract-driven and testable.
- New styling work should prefer root theme inheritance first, then add component-level compatibility only if required.

## Umbraco integration flow

1. Umbraco selects site template or identity.
2. The root or themed container receives `data-theme`, `theme`, or CSS variable overrides.
3. Semantic runtime tokens resolve at that boundary.
4. Angular elements and shared components inherit those tokens.
5. Component-local variables adapt styling without knowing CMS details.

## What stays out of component scope

Components should not own:

- palette definitions
- site identity decisions
- cross-site theme branching
- arbitrary brand colors
- CMS-specific template logic

## What stays in component scope

Components own:

- mapping system tokens to component roles
- interactive states
- layout density
- internal spacing and hierarchy
- optional compatibility overrides for legacy local theme modifiers
