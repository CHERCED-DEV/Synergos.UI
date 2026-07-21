# 03 Theme Contract

## Naming rules

### Use semantic intent, not decorative names

Prefer:

- `--syn-color-surface-primary`
- `--syn-color-text-secondary`
- `--syn-color-border-accent`
- `--syn-color-action-primary`
- `--syn-color-focus-ring`
- `--syn-shadow-card`

Avoid in components:

- raw palette shade names
- decorative names like `gold-ish`
- framework-specific aliases for visual meaning

## Contract levels

### Primitive layer

Examples:

- `--syn-color-neutral-*`
- `--syn-color-brand-*`
- `--syn-color-accent-*`
- radius and duration variables

### Semantic layer

Examples:

- `--syn-color-surface-canvas`
- `--syn-color-surface-primary`
- `--syn-color-surface-secondary`
- `--syn-color-surface-inverse`
- `--syn-color-text-primary`
- `--syn-color-text-muted`
- `--syn-color-border-default`
- `--syn-color-action-primary`
- `--syn-color-action-secondary-border`
- `--syn-color-state-danger-surface`
- `--syn-shadow-card`
- `--syn-gradient-hero`

### Component layer

Examples implemented in this increment:

- `--syn-button-*`
- `--syn-input-*`
- `--syn-card-*`
- `--syn-panel-*`
- `--syn-section-*`
- `--syn-hero-*`
- `--syn-banner-*`
- `--pc-*` (product-card local contract)
- `--pd-*` (product-detail local contract)
- `--cs-*` (cart-summary local contract)
- `--pg-*` (product-grid local contract)
- `--prc-*` (price-display local contract)
- `--ci-*` (cart-item local contract)
- `--qty-*` (quantity-selector local contract)
- `--vp-*` (variant-picker local contract)
- `--nf-*` (newsletter-form local contract)
- `--kv-*` (key-value local contract)
- `--fi-*` (faq-item local contract)
- `--fs-*` (faq-section local contract)
- `--mt-*` (media-text local contract)
- `--ti-*` (timeline-item local contract)
- `--tmi-*` (testimonial-item local contract)
- `--tss-*` (testimonial-section local contract)
- `--lc-*` (logo-cloud local contract)
- `--gi-*` (gallery-item local contract)
- `--li-*` (logo-item local contract)
- `--tg-*` (tab-group local contract)
- `--dt-*` (data-table module-level local contract)
- `--syn-link-*` (shared link primitive contract)
- `--syn-list-*` (shared list primitive contract)
- `--syn-select-*` (shared select primitive contract)
- `--syn-textarea-*` (shared textarea primitive contract)
- `--syn-toggle-*` (shared toggle primitive contract)
- `--syn-status-tag-*` (shared status-tag primitive contract)
- `--syn-social-links-*` (shared social-links pattern contract)
- `--syn-description-list-*` (shared description-list contract)
- `--syn-tabs-*` (shared tabs contract)
- `--syn-data-table-*` (shared data-table contract)

## Theme definitions

### Light

Contract goals:

- readable default enterprise surface stack
- dark text on light surfaces
- blue brand emphasis
- subtle elevated glass for banners and hero content containers

### Dark

Contract goals:

- dark canvas and layered panels
- bright readable text
- brand emphasis without glare
- stronger shadows and focus contrast

### Silver Gold

Contract goals:

- warm premium neutrals
- graphite for primary actions
- controlled gold accent only on emphasis surfaces, borders, and highlights
- stronger perception of finish, not ornamental decoration

## Legacy compatibility

- `--sg-color-action-primary`
- `--sg-color-action-primary-hover`
- `--sg-color-action-primary-text`
- `--sg-brand-gradient-hero`
- `--sg-brand-divider-gradient`
- `--sg-brand-surface-glass-bg`
- `--sg-brand-surface-backdrop-blur`
- `--sg-brand-cta-glow`

These variables remain valid and feed the new `--syn-*` semantic contract.

## What belongs in `:root`

Allowed in `:root` or themed container:

- brand identity values
- semantic surfaces and text roles
- action semantics
- border semantics
- state semantics
- focus rings
- gradients and elevation values

## What should not be defined in `:root`

Do not place per-component layout behavior in root, such as:

- card internal gaps
- input label spacing
- hero CTA alignment
- carousel slide sizing

Those remain component concerns.

## Contract rule for new components

Every new component should follow this sequence:

1. consume semantic `--syn-*` variables
2. map them into component-local variables
3. style states from the local variables
4. only add local theme modifiers for backward compatibility when root inheritance is not enough
