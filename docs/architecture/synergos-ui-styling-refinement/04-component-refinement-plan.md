# 04 Component Refinement Plan

## Completed in this increment

### Foundation

- created a runtime theme contract for `light`, `dark`, and `silver-gold`
- removed the hardcoded `color-scheme: light` behavior from the global layer
- made focus ring behavior theme-aware

### Shared primitives

- refined `heading`
- refined `button`
- refined `input`
- refined `badge`

### Shared containers

- refined `card`
- refined `panel`
- refined `section`

### Visible Angular elements

- refined `hero`
- refined `banner`
- refined composition `card`

### Wave 2 completed

- refined module `section`
- refined module `feature-grid`
- refined module `testimonial-section`
- refined composition `info-block`
- refined composition `feature-item`

### Wave 3 completed (shop domain)

- refined `domains/shop/product-card`
- refined `domains/shop/product-detail`
- refined `domains/shop/cart-summary`
- standardized those components to local token layers backed by semantic root tokens
- added compatibility selectors for emitted Angular `sg-*` theme/layout classes
- fixed stale `syn-button` variant usage in `product-card` (`primary` -> `solid`)

### Wave 4 completed (shop convergence)

- refined `domains/shop/product-grid`
- refined `domains/shop/price-display`
- refined `domains/shop/cart-item`
- refined `domains/shop/quantity-selector`
- refined `domains/shop/variant-picker`
- unified all of the above under semantic runtime tokens + local component contracts
- normalized emitted Angular class compatibility (`sg-*`) across migrated shop surfaces

### Wave 5 completed (legacy + shared core)

- refined `elements/compositions/newsletter-form`
- refined `elements/compositions/social-share`
- refined `elements/compositions/key-value`
- refactored shared `link` primitive to token-driven style contracts
- refactored shared `social-links` and `description-list` to token-driven contracts
- removed stale/dead styling assumptions by aligning composition wrappers with actual rendered shared components

### Wave 6 completed (composition parity + host class convergence)

- refined `elements/compositions/faq-item`
- refined `elements/compositions/media-text`
- refined `elements/compositions/timeline-item`
- converged class compatibility by emitting both `legacy` and `sg-*` host class tokens in Angular wrappers
- fixed `faq-item` config resolution drift by adding typed support for `initiallyExpanded` in contracts and runtime mapping

### Wave 7 completed (faq/testimonial family convergence)

- refined `elements/modules/faq-section`
- refined `elements/compositions/testimonial-item`
- refined `elements/modules/testimonial-section`
- converged host class emission to dual compatibility (`legacy` + `sg-*`) for the affected wrappers
- introduced explicit local token contracts for those three components and aligned child tone mapping in FAQ accordions

### Wave 8 completed (logo/tab/table convergence)

- refined `elements/modules/logo-cloud`
- refined `elements/compositions/gallery-item`
- refined `elements/compositions/logo-item`
- refined `elements/modules/tab-group`
- refined `elements/modules/data-table`
- refined shared `compositions/tabs`
- refined shared `patterns/data-table`
- added token bridges (`--syn-tabs-*`, `--syn-data-table-*`) from wrappers to shared components
- fixed responsive table labeling path by binding `td[data-label]`
- hardened wrapper config fallback handling while preserving API compatibility

### Wave 9 completed (template semantics and a11y hardening)

- refined semantic structure in `elements/modules/faq-section` (`ul/li`)
- improved loading semantics in `domains/shop/product-card` (`role="status"`, `aria-live="polite"`)
- corrected `logo-item` image-role semantics for non-image fallback mode
- added section label fallback for `tab-group` when title is absent
- hardened shared `syn-tabs` ARIA id generation to be instance-safe

### Wave 10 completed (shared list + shop semantic continuity)

- refined shared `primitives/list` accessibility contract (`click` + keyboard parity + focusability)
- migrated `list` primitive to semantic local tokens (`--syn-list-*`)
- refined `domains/shop/product-detail` media/thumbnail semantics and image loading hints
- refined `domains/shop/variant-picker` swatch image loading hints and cleaned label separators
- closed pre-existing `shared:lint` failures in `primitives/list`

### Wave 11 completed (shared form primitive convergence)

- refined shared `primitives/select`
- refined shared `primitives/textarea`
- refined shared `primitives/toggle`
- refined shared `primitives/status-tag`
- activated `select` and `textarea` invalid/hint rendering contracts (API + template + aria mapping)
- aligned all four primitives with semantic token-first contracts and removed palette-coupled style decisions
- added validation coverage for new `select`/`textarea` state contracts

### Wave 12 completed (control primitives + drawer UX hardening)

- refined shared `primitives/checkbox`
- refined shared `primitives/radio`
- refined shared `primitives/range-slider`
- refined shared `primitives/icon-button`
- exposed `syn-icon-button` visual API parity for implemented styles (`ghost`, `danger`, `sm`, `lg`)
- improved `domains/shop/cart-summary` dialog semantics (`aria-labelledby`, keyboard `Escape` close path, interactive backdrop button with label)
- fixed shop icon glyph encoding drift in templates by using HTML entities (`&times;`, `&minus;`)
- aligned cart actions to explicit variants (`cart close` ghost, `cart remove` danger, quantity controls ghost)

### Wave 13 completed (shop template semantics + interaction clarity)

- refined `domains/shop/product-grid` template semantics and live-status labeling
- refined `domains/shop/product-detail` loading/error/stock/quantity/add-to-cart accessibility labeling
- refined `domains/shop/variant-picker` dropdown label duplication and option label encoding
- refined `domains/shop/product-card` action event contract alignment (`pressed`) and CTA aria naming
- fixed residual glyph encoding drift in shop runtime labels (`stars`, variant labels, detail cart payload separator)

### Wave 14 completed (shop control hardening + i18n accessibility)

- refined `domains/shop/quantity-selector`:
  - migrated action controls to native buttons (semantic, focusable, deterministic)
  - added translation-driven aria contracts (`quantity`, `increase`, `decrease`)
  - hardened external value synchronization and clamping behavior
- refined `domains/shop/price-display`:
  - removed hardcoded aria text
  - added translation-driven aria contracts for display/current/original/discount labels
- refined `domains/shop/cart-summary`:
  - hardened drawer closed-state semantics (`aria-hidden`, backdrop tab stop guard)
  - added explicit list/totals/coupon input aria labeling
- refined `domains/shop/cart-item`:
  - associated quantity control with local accessible label
  - enabled polite subtotal live updates
- refined `domains/shop/product-detail`:
  - replaced static gallery/rating aria labels with translation-driven labels
  - aligned quantity selector integration with explicit `ariaLabelledBy` input contract
- refined `domains/shop/product-card` and `domains/shop/product-grid`:
  - removed misleading pointer affordance on non-clickable card containers
  - localized product-card loading aria label
- cleaned residual direct color fallback literals in shop SCSS by using semantic/core token fallbacks (no raw `rgb(...)` left in shop domain styles)

### Wave 15 completed (product-grid pagination + stock semantics fix)

- refined `domains/shop/product-grid`:
  - activated pagination UI previously missing despite existing `currentPage/totalPages` state
  - added bounded navigation methods (`previousPage`, `nextPage`) and computed guards (`canGoPrevious`, `canGoNext`)
  - introduced translation-driven pagination labels/status (`pagination`, `previous`, `next`, `page`, `pageStatus`)
  - added tokenized pagination visual contract and responsive behavior
- refined `domains/shop/product-detail`:
  - replaced low-stock suffix fallback key misuse with dedicated semantic key (`Shop.Product.StockRemaining`)

### Wave 16 completed (navigation contract from catalog to detail)

- refined `domains/shop/product-grid`:
  - added `productUrlTemplate` input/config support
  - resolved templated URLs with `{id}`, `{sku}`, `{slug}` placeholders
  - added accessible image/title/details links when URL is available
  - emitted cancelable `sg:product:selected` event on navigation intent
- refined `domains/shop/product-card`:
  - added `productUrlTemplate` input/config support
  - added accessible image/title/details links when URL is available
  - emitted cancelable `sg:product:selected` event on navigation intent
- refined contracts + mapping chain:
  - `vitals/contracts/src/element-config.contract.ts`
  - `vitals/contracts/src/element-inputs.json`
  - `vitals/core/src/models/{product-grid-inputs,product-card-inputs}.model.ts`
  - `vitals/core/src/mappers/{product-grid.mapper,product-card.mapper}.ts`
  - result: CMS -> mapper -> element input now carries `productUrlTemplate` explicitly and typely

### State/API hardening linked to styling

- exposed `danger` and `gradient` button variants
- exposed `hint` and `invalid` input states
- exposed `ghost` and `danger` icon-button variants plus explicit icon-button sizing

## P0 next targets

- remaining shop and experience surfaces that still contain palette-bound local dark trees
- final pass to reduce residual direct color literals in production SCSS

Reason:

The core shop chain is already migrated and building. The highest return now is finishing legacy modules and reducing remaining hardcoded color debt outside the migrated domains.

## P1 cleanup targets

- replace remaining `--dark` selector trees with component-local tokens backed by root semantics
- migrate local preview `index.html` files off direct hex values where worth keeping
- normalize remaining focus and disabled behavior in legacy modules
- converge remaining form-heavy surfaces to the same input/button/panel token family

## P2 intentional exceptions to review, not blindly remove

- external network-specific brand accents may stay isolated if product explicitly requires strict platform colors
- demo shell styling may remain simpler if it is clearly separated from production component styling

## Quick wins still open

- keep converging `shop` aliases emitted by `CMS.Web` into typed canonical config in `vitals/contracts` and `vitals/core`
- extend the same hardening pattern to non-shop domains where `CMS.Web` aliases diverge from canonical UI inputs
- decide which registry aliases in `block.mapper.ts` are intentional compatibility shims versus debt to remove later
- continue extending the new opt-in runtime config sanitization pattern beyond the already covered set:
  - completed: `shop`, `newsletter-form`, `iframe-embed`, `external-widget`, `script-embed`, `angular-host`, `mf-host`, `macro-host`
  - next: dynamic content and remaining widget-like modules
- decide whether `showReviews/showRelated` in product detail stay as compatibility-only fields or evolve into real Angular rendering features
- centralize more component-level shadow and overlay values under semantic tokens
- continue semantic/accessibility hardening in remaining element templates (dialog traps, aria naming, keyboard affordances)
- add visual regression snapshots per theme for hero, banner, card, input, button, and badge

## Migration guidance

### Safe migration path

1. move component palette usage into local CSS variables
2. map local variables to semantic `--syn-*`
3. keep legacy dark modifiers only as compatibility wrappers
4. remove direct palette usage only after the component renders correctly under all three themes

### Avoid during migration

- rewriting whole modules without first isolating component tokens
- introducing theme logic into TypeScript when CSS inheritance already solves it
- creating one-off theme names outside the semantic contract

- extend hardened config ingress to any remaining `shop` or composition components still using plain `coerceConfigInput`
- keep eliminating contract drift where a config field is declared publicly but not actually consumed by the Angular component

- cerrar la misma migración de saneamiento en `apps/elements` y `experiences`, empezando por los módulos con arrays/config externa (`data-table`, `banner-slider`, `tab-group`, `testimonial-section`, `logo-cloud`)
- considerar tests unitarios específicos para sanitizadores de estructuras compuestas en `shared` (`list`, `overview-card`, `pricing-card`)

- cerrar el resto de `apps/elements/modules` como siguiente bloque coherente:
  - `hero`
  - `faq-section`
  - `feature-grid`
  - `section`
  - `banner`
- después moverse a `apps/elements/compositions`, que aún concentra buena parte de la deuda restante de config plana

- siguiente bloque objetivo: `apps/elements/compositions`
- dentro de `compositions`, priorizar primero los componentes con arrays o payloads ricos:
  - `button-group`
  - `social-share`
  - `gallery-item`
  - `card`
  - `media-text`
  - `faq-item` / `timeline-item`

- siguiente etapa ya no es barrer `coerceConfigInput`; ese frente quedó cerrado
- nuevo foco recomendado:
  - consolidar campos runtime compat locales que deberían promoverse a contratos públicos (`vitals/contracts`) o eliminarse si son deuda accidental
  - atacar warnings de `element:audit` por aliases/registry legacy
  - añadir tests dirigidos a sanitizadores complejos y adapters que siguen siendo puntos de entrada de datos externos

- recent consolidation:
  - pps/elements removed nearly all redundant local RuntimeConfig types
  - data-table remains the only intentional exception because it normalizes rows/columns structurally
  - logo-cloud.columns is now part of the TS contract so published inputs, Angular runtime, and typing stay aligned

- validation hardening added module-level tests for the highest-risk compound config surfaces: data-table, anner-slider, logo-cloud, 	ab-group, and eature-grid

- compound composition surfaces hardened and revalidated: social-share, utton-group, 
ewsletter-form

## Completed in this wave
- Shared: modal, accordion, filter-panel, overview-card, pricing-card, data-table, social-links.
- Elements modules: hero, banner, feature-grid, faq-section, testimonial-section, logo-cloud, data-table.
- Elements compositions: card, media-text, gallery-item, button-group.

## Next visual backlog
- Refine remaining compositions with lower visual maturity: alert-bar, social-share wrapper behavior, newsletter-form final density pass.
- Move into remaining domains/apps where the new shared system is not yet fully expressed in page-level layouts.
- Run a final cross-theme pass for light, dark and silver-gold on real assembled screens.


## Finalized in closing wave
- Remaining composition UX debt closed for alert-bar, social-share and newsletter-form.
- Residual hardcoded UX copy removed from newsletter-form and replaced with translation-backed computed labels.
- Alert-bar runtime compatibility aligned with published contract through 	one support.


## SCSS Closure complete
- Minor compositions normalized: cta-group, info-block, key-value, feature-item, faq-item, timeline-item, testimonial-item, logo-item.
- Primitive wrappers normalized: button-container, container-block, image-block, video-block.
- Experience surfaces normalized: feature-journey, insight-explorer, media-explorer.
- Styling work for pps/angular can be considered closed for this phase.


## Wave 17 Completed
- Experience shells now consume 	ranslations for UX labels instead of relying on embedded strings.
- anner-slider elevated from token-adjacent styling to full semantic theming for light, dark and silver-gold.
- 
ewsletter-form visual affordance corrected by replacing placeholder glyph output with a stable directional arrow.
