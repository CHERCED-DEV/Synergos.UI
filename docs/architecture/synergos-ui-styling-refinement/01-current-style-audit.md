# 01 Current Style Audit

## Scope reviewed

- `vitals/core-assets/src/scss`
- `platforms/angular/libs/shared/src/components`
- `platforms/angular/apps/elements`
- Existing design notes in `SynergosDocs/DESIGN_SYSTEM.md`

## Current map

- `vitals/core-assets`: foundation layer with palette, spacing, typography, radius, elevation, motion, semantic Sass aliases, and a partial runtime token layer.
- `platforms/angular/libs/shared`: primitives, compositions, and patterns reused by Angular elements and experience apps.
- `platforms/angular/apps/elements`: CDN-facing web components consumed from Umbraco.

## Strengths found

- The project already had a serious Sass foundation: spacing, typography, radius, shadows, motion, and semantic aliases existed.
- Shared Angular primitives were already centralized, which made high-impact refinements practical.
- The UI library was already conceptually aligned with a design-system approach, even if runtime theming was incomplete.

## Main weaknesses found before the refinement

- Runtime theming was partial. `:root` variables existed, but most components still resolved visual decisions directly from Sass palette tokens.
- `html` was hardcoded to `color-scheme: light`, so dark theming was not treated as a first-class runtime concern.
- Theme behavior was mostly implemented through component-local `--dark` modifier classes instead of a root semantic contract.
- Several components had basic visual treatment: weak elevation, neutral padding rhythm, limited state depth, and inconsistent component hierarchy.
- Some styled states were not actually reachable from component APIs.
  - `syn-input` had error and hint styles, but no actual `invalid`/`hint` rendering contract.
  - `syn-button` had `danger` and `gradient` styles without API support.
- High-value modules such as `hero`, `banner`, cards, buttons, inputs, headings, badges, panels, and sections were still tied to fixed palette values.

## Hardcodes and styling debt still visible in the repo

- Remaining dark-modifier selectors in Angular codebase: `57`
- Remaining direct color literals in `platforms/angular/apps/elements` and `platforms/angular/libs/shared/src/components`: `70`
- Most remaining literals are concentrated in:
  - demo `index.html` files used as local previews
  - legacy modules not touched in this increment
  - a few intentional brand-color exceptions such as `social-share`
  - legacy dark variants such as `newsletter-form`

## High-impact visual problems found

- Buttons were functional but visually flat. Outline and ghost variants lacked a polished tonal system.
- Inputs lacked mature surface/border semantics and did not expose their styled invalid state cleanly.
- Cards and panels used correct structure but weak surface hierarchy and shallow interactive depth.
- Section containers were too neutral and lacked an elevated system language.
- Hero and banner modules did not fully exploit the runtime token layer and relied on palette-driven appearance.

## Theming problems found

- `light` and `dark` were not modeled as a global semantic token contract.
- `silver-gold` did not exist as a first-class identity.
- The current contract did not formally separate:
  - palette primitives
  - semantic theme tokens
  - component-local tokens
  - legacy CMS compatibility variables

## Angular-specific observations

- Angular styling quality was uneven: some components had good structure but still consumed Sass palette values directly.
- Host theme APIs existed conceptually, but the real visual contract was not yet root-first.
- Shared components were the right seam to improve first because they propagate into multiple web components.

## What was improved in this increment

- Introduced a real runtime semantic theme contract in `vitals/core-assets/src/scss/tokens/_brand.scss`.
- Added native support for `light`, `dark`, and `silver-gold` theme scopes.
- Switched shared primitives and core visible elements to semantic CSS variable consumption.
- Hardened focus ring behavior through theme-aware runtime tokens.
- Raised the visual level of button, input, heading, badge, card, panel, section, hero, banner, and element-card.
- Closed two style-contract gaps in Angular APIs:
  - `syn-button` now exposes `danger` and `gradient`
  - `syn-input` now exposes `hint` and `invalid`

## Wave 2 extension (continued refinement)

In the continuation pass, these additional elements were migrated to semantic runtime tokens:

- `elements/modules/section`
- `elements/modules/feature-grid`
- `elements/modules/testimonial-section`
- `elements/compositions/info-block`
- `elements/compositions/feature-item`

Additional measured impact after Wave 2:

- Remaining dark-modifier selectors in Angular codebase: `51` (previously `57`)
- Runtime token references (`var(--syn-|--sg-)`) in `elements + shared`: `371` (previously `270`)
- Direct color literals in `elements + shared`: `70` (unchanged, mostly concentrated in demo `index.html` and legacy modules outside this scope)

## Wave 3 extension (shop domain hardening)

In this continuation pass, these domain components were migrated to root-first semantic styling:

- `domains/shop/product-card`
- `domains/shop/product-detail`
- `domains/shop/cart-summary`

Key findings and fixes applied in this wave:

- Component styles were still mostly palette-driven and depended on local dark modifier trees.
- Theme/layout class compatibility had a runtime mismatch:
  - templates emitted `sg-*` classes (for example `sg-product-card--dark`)
  - SCSS expected non-prefixed classes (for example `.product-card--dark`)
- `product-card` contained a stale button variant value (`primary`) not accepted by current shared button API (`solid | outline | ghost | danger | gradient`).

Wave 3 measurable snapshot in `platforms/angular/apps/domains/shop`:

- Semantic runtime token references (`var(--syn-|--sg-)`): `134`
- Direct color literals (`#`, `rgb`, `rgba`) in SCSS: `10`
- Remaining `--dark` markers in shop SCSS: `15` (now mostly compatibility wrappers and untouched shop components)

## Wave 4 extension (shop convergence)

This pass continued the same token-first migration for the remaining core shop building blocks:

- `domains/shop/product-grid`
- `domains/shop/price-display`
- `domains/shop/cart-item`
- `domains/shop/quantity-selector`
- `domains/shop/variant-picker`

Additional hardening completed:

- Standardized local component token contracts (`--pg-*`, `--prc-*`, `--ci-*`, `--qty-*`, `--vp-*`).
- Added compatibility selectors for emitted `sg-*` classes in components where template class binding was previously mismatched with SCSS selectors.
- Preserved existing class APIs while moving visual decisions to semantic runtime variables.

Wave 4 measurable snapshot in `platforms/angular/apps/domains/shop`:

- Semantic runtime token references (`var(--syn-|--sg-)` in SCSS): `285` (up from `134`)
- Direct color literals (`#`, `rgb`, `rgba`) in SCSS: `14`
- Remaining `--dark` markers in shop SCSS: `15` (still mostly compatibility wrappers)

## Wave 5 extension (legacy compositions + shared styling core)

This pass hardened high-friction legacy surfaces and the shared styling primitives they depend on:

- `elements/compositions/newsletter-form`
- `elements/compositions/social-share`
- `elements/compositions/key-value`
- `shared/primitives/link`
- `shared/patterns/social-links`
- `shared/compositions/description-list`

Structural improvements in this wave:

- Replaced palette-driven styling with local component contracts (`--nf-*`, `--kv-*`) wired to semantic runtime tokens.
- Converted shared `link`, `social-links`, and `description-list` to variable-first contracts so compositions can theme them safely without brittle deep selectors.
- Removed stale social-share styling blocks that no longer matched actual template structure, replacing them with root-driven token overrides.
- Eliminated remaining direct color literals in production SCSS for `elements + shared components`.

Wave 5 measurable snapshot (`platforms/angular/apps/elements` + `platforms/angular/libs/shared/src/components`, SCSS only):

- Semantic runtime token references (`var(--syn-|--sg-)`): `531`
- Direct color literals (`#`, `rgb`, `rgba`): `0`
- Remaining `--dark` markers: `28` (mostly compatibility classes for local theme hooks during migration)

## Wave 6 extension (composition parity + contract correction)

This pass refined the next legacy composition set and closed a contract drift found by tests:

- `elements/compositions/faq-item`
- `elements/compositions/media-text`
- `elements/compositions/timeline-item`

Key hardening completed:

- Migrated these three components to local token contracts (`--fi-*`, `--mt-*`, `--ti-*`) backed by semantic runtime tokens.
- Added dual class compatibility in Angular host class emission and SCSS selectors (`legacy` + `sg-*`) to avoid selector mismatch regressions.
- Added missing typed contract support for `faq-item.initiallyExpanded` and aligned runtime resolution to consume that value from `config`.

Wave 6 measurable snapshot (`platforms/angular/apps/elements` + `platforms/angular/libs/shared/src/components`, SCSS only):

- Direct color literals (`#`, `rgb`, `rgba`): `0`
- Remaining `--dark` markers: `31` (increase is expected from compatibility wrappers, not from new palette hardcoding)

## Wave 7 extension (faq/testimonial module-composition convergence)

This pass completed the FAQ and testimonial family convergence around the same visual contract:

- `elements/modules/faq-section`
- `elements/compositions/testimonial-item`
- `elements/modules/testimonial-section`

Key hardening completed:

- Migrated FAQ/testimonial styles to explicit local token contracts (`--fs-*`, `--tmi-*`, `--tss-*`) backed by semantic runtime variables.
- Standardized Angular host class emission to dual compatibility (`legacy` + `sg-*`) in the affected wrappers.
- Added theme-aware accordion tone wiring in `faq-section` (`brand` for dark, `neutral` otherwise) to avoid weak contrast and flat behavior in dark context.

Wave 7 measurable snapshot (`platforms/angular/apps/elements` + `platforms/angular/libs/shared/src/components`, SCSS only):

- Semantic runtime token references (`var(--syn-|--sg-)`): `517`
- Direct color literals (`#`, `rgb`, `rgba`): `0`
- Remaining `--dark` markers: `33` (expected compatibility wrappers, not palette regressions)

## Wave 8 extension (logo/tab/table convergence + token bridge hardening)

This pass converged the next cross-cutting set where Umbraco/CMS usage is frequent:

- `elements/modules/logo-cloud`
- `elements/compositions/gallery-item`
- `elements/compositions/logo-item`
- `elements/modules/tab-group`
- `elements/modules/data-table`
- shared `compositions/tabs`
- shared `patterns/data-table`

Key hardening completed:

- Migrated the affected components to explicit local token contracts (`--lc-*`, `--gi-*`, `--li-*`, `--tg-*`, `--dt-*`) backed by semantic runtime variables.
- Added token bridges from module wrappers to shared components (`--syn-tabs-*`, `--syn-data-table-*`) to avoid brittle deep selector overrides.
- Fixed a responsive behavior gap in shared data-table by wiring `td[data-label]` from column metadata.
- Continued dual class compatibility (`legacy` + `sg-*`) where wrappers still need migration-safe selectors.
- Hardened runtime parsing/config fallback paths while preserving existing APIs.

Wave 8 measurable snapshot (`platforms/angular/apps/elements` + `platforms/angular/libs/shared/src/components`, SCSS only):

- Semantic runtime token references (`var(--syn-|--sg-)`): `623`
- Direct color literals (`#`, `rgb`, `rgba`): `0`
- Remaining `--dark` markers: `36` (compatibility wrappers, not new palette hardcoding)

## Wave 9 extension (HTML semantics + accessibility refinement)

This pass focused on template quality without changing integration contracts:

- `modules/faq-section`: semantic list structure (`ul/li`) for FAQ entries.
- `domains/shop/product-card`: accessible loading skeleton (`role="status"`, `aria-live="polite"`) and fixed malformed loading label encoding.
- `compositions/logo-item`: corrected `role="img"`/`aria-label` usage so it is only applied when no real image is rendered.
- `modules/tab-group`: section-level fallback `aria-label` when no title is present.
- shared `tabs`: unique ARIA ids per component instance to avoid collisions across multiple tab groups on the same page.

## Wave 10 extension (shared list hardening + shop template semantics)

This pass closed a cross-cutting accessibility debt in shared primitives and continued semantic HTML hardening in shop surfaces:

- shared `primitives/list`
- `domains/shop/product-detail`
- `domains/shop/variant-picker`

Key hardening completed:

- Fixed pre-existing `shared:lint` accessibility failures in `syn-list` by adding keyboard activation and focusability for interactive rows (`Enter`/`Space` + `tabindex`/`role` semantics).
- Migrated `syn-list` styling to semantic token contracts (`--syn-list-*`) and removed palette-coupled defaults from the primitive surface API.
- Improved `product-detail` and `variant-picker` media markup with explicit image loading/decoding hints and cleaned malformed text glyphs in UI labels.
- Added `role="listitem"` semantics to product-detail thumbnail actions when rendered inside a list container.

Wave 10 measurable snapshot (`platforms/angular/apps/elements` + `platforms/angular/libs/shared/src/components`, SCSS only):

- Semantic runtime token references (`var(--syn-|--sg-)`): `635`
- Direct color literals (`#`, `rgb`, `rgba`): `0`
- Remaining `--dark` markers: `36` (compatibility wrappers, not palette regressions)

## Wave 11 extension (form primitive convergence)

This pass finished the highest-priority shared form primitive set and closed state-contract drift:

- shared `primitives/select`
- shared `primitives/textarea`
- shared `primitives/toggle`
- shared `primitives/status-tag`

Key hardening completed:

- Migrated all four primitives to semantic token-first contracts (`--syn-select-*`, `--syn-textarea-*`, `--syn-toggle-*`, `--syn-status-tag-*`).
- Activated previously unreachable error/hint styling paths in `select` and `textarea` by adding explicit API/state contracts (`invalid`, `hint`, `aria-describedby` composition).
- Added/updated tests to validate state-contract reachability for `select` and `textarea`.
- Preserved existing public APIs and behavior for consumers while making form states deterministic and testable.

Wave 11 measurable snapshot (`platforms/angular/apps/elements` + `platforms/angular/libs/shared/src/components`, SCSS only):

- Semantic runtime token references (`var(--syn-|--sg-)`): `767`
- Direct color literals (`#`, `rgb`, `rgba`): `0`
- Remaining `--dark` markers: `36` (compatibility wrappers, not palette regressions)

## Wave 12 extension (control primitive convergence + shop UX semantics)

This pass focused on the remaining shared control primitives and a high-impact shop drawer interaction path:

- shared `primitives/checkbox`
- shared `primitives/radio`
- shared `primitives/range-slider`
- shared `primitives/icon-button`
- `domains/shop/cart-summary` template semantics and backdrop behavior
- `domains/shop/cart-item` and `domains/shop/quantity-selector` icon glyph resilience

Key hardening completed:

- migrated the four shared control primitives to semantic token-first contracts (`--syn-checkbox-*`, `--syn-radio-*`, `--syn-range-slider-*`, `--syn-icon-button-*`)
- activated API parity in `syn-icon-button` for existing visual variants/sizes (`ghost`, `danger`, `sm`, `lg`)
- removed malformed glyph dependency in shop templates by switching to HTML entities (`&times;`, `&minus;`)
- improved cart drawer semantics with explicit `aria-labelledby`, keyboard escape handling, and a labeled interactive backdrop button
- aligned cart action intent with explicit icon-button variants (`ghost` for dismissive actions, `danger` for destructive remove action)

Wave 12 measurable snapshot (scope-specific):

- shared control primitives migrated in this wave: `4`
- shop templates with encoding-safe icon glyph updates: `3`
- shared control primitive SCSS files with direct color literals (`#`, `rgb`, `rgba`): `0`

## Wave 13 extension (shop semantic UX continuity)

This pass focused on semantic and interaction polish in high-traffic shop templates while preserving existing contracts:

- `domains/shop/product-grid`
- `domains/shop/product-detail`
- `domains/shop/variant-picker`
- `domains/shop/product-card`

Key hardening completed:

- strengthened section/search/live region labeling in product-grid and removed residual glyph-encoding drift in rating display
- aligned product-card CTA to shared button event contract (`pressed`) and explicit aria naming with product context
- removed duplicate visual labeling path in variant-picker dropdown mode and normalized out-of-stock option labeling
- improved product-detail loading/error labels, stock live updates, quantity control association (`aria-labelledby`), and CTA aria label
- normalized residual encoded separator text in product-detail add-to-cart payload naming

Wave 13 measurable snapshot (scope-specific):

- shop templates hardened in this wave: `4`
- glyph-encoding fixes in shop TS/HTML labels: `3`
- validated builds after this wave: `4` shop projects (`product-grid`, `product-detail`, `variant-picker`, `product-card`)

## Wave 14 extension (shop controls + translation-driven accessibility)

This pass focused on making shop controls more robust under CMS-driven runtime localization and tightening state/theming behavior without changing API contracts:

- `domains/shop/quantity-selector`
- `domains/shop/price-display`
- `domains/shop/cart-summary`
- `domains/shop/cart-item`
- `domains/shop/product-detail`
- `domains/shop/product-card`
- `domains/shop/product-grid`
- `domains/shop/variant-picker`

Key hardening completed:

- refactored `quantity-selector` to native semantic buttons (`button`) with explicit keyboard/focus behavior and removed fragile style coupling to nested icon-button internals
- added translation-driven aria labels for quantity control actions and field naming (`Shop.Product.Quantity`, `DecreaseQuantity`, `IncreaseQuantity`)
- stabilized quantity synchronization so external `value` updates clamp safely without undoing local interaction state
- migrated remaining hardcoded aria strings in `price-display`, `product-card`, and `product-detail` to translation-backed labels
- improved cart drawer semantics: inert backdrop when closed (`tabIndex`/`aria-hidden`), list/totals labeling, and explicit coupon input aria contract
- improved cart item semantics with quantity label association and polite subtotal announcements
- removed remaining `rgb(...)` fallback literals from `domains/shop` SCSS by mapping fallbacks to semantic/core token variables
- aligned non-clickable product cards in grid/card surfaces to `cursor: default` to avoid misleading interaction affordances

Wave 14 measurable snapshot (scope-specific):

- shop SCSS files with direct color literals (`#`, `rgb`, `rgba`): `0` in `platforms/angular/apps/domains/shop`
- shop projects built after this wave: `8` (`price-display`, `quantity-selector`, `variant-picker`, `cart-item`, `product-grid`, `product-card`, `product-detail`, `cart-summary`)
- shop lint fully passing: `5/8` (3 blocked by pre-existing workspace/module-boundary issues)

## Wave 15 extension (product listing navigation maturity)

This pass focused on completing missing user-flow behavior in the shop listing experience and tightening stock semantics:

- `domains/shop/product-grid`
- `domains/shop/product-detail`

Key hardening completed:

- activated a typed, accessible pagination flow in `product-grid` using existing `currentPage`/`totalPages` runtime state (previous/next controls + live status text)
- added translation-driven pagination labels and page status contract keys (`Shop.Filter.Pagination`, `Previous`, `Next`, `Page`, `PageStatus`)
- introduced explicit guard logic for page bounds (`canGoPrevious`, `canGoNext`) and deterministic page transitions
- added tokenized pagination styling for all themes (light/dark/silver-gold-compatible via semantic tokens)
- corrected product-detail low-stock suffix semantics by replacing an incorrect translation fallback path (`Shop.Product.Quantity`) with a dedicated stock-remaining semantic key (`Shop.Product.StockRemaining`)

Wave 15 measurable snapshot (scope-specific):

- shop components with new interaction flow this wave: `1` (`product-grid` pagination)
- translation-key misuse fixed in stock messaging: `1`
- validated builds after this wave: `2` shop projects (`product-grid`, `product-detail`)

## Wave 16 extension (catalog-to-detail navigation contract hardening)

This pass focused on turning product discovery surfaces into first-class integration points for host navigation, without coupling routing logic to Angular internals:

- `domains/shop/product-grid`
- `domains/shop/product-card`
- `vitals/contracts` + `vitals/core` mapper/model bridge

Key hardening completed:

- introduced a new additive config contract field `productUrlTemplate` in `ProductGridElementConfig` and `ProductCardElementConfig`
- propagated `productUrlTemplate` through CMS contract metadata and mapping chain:
  - `ELEMENT_CONFIG_FIELDS`
  - `element-inputs.json`
  - `vitals/core` models and mappers (`product-grid`, `product-card`)
- implemented placeholder-based URL resolution with explicit supported tokens:
  - `{id}`, `{sku}`, `{slug}`
- added host-interceptable navigation event `sg:product:selected` (cancelable) on product-grid/product-card navigation interactions
- wired accessible clickable affordances in product-grid/product-card (image/title/details link) with explicit aria labeling and focus-visible behavior
- preserved backward compatibility:
  - if `productUrlTemplate` is not provided, existing behavior remains unchanged (no implicit navigation)

Wave 16 measurable snapshot (scope-specific):

- new additive contract fields introduced: `2` (`product-card`, `product-grid`)
- navigation events added: `1` (`sg:product:selected`)
- validated builds after this wave: `2` shop projects (`product-grid`, `product-card`)
- validated lint after this wave: `2/2` shop projects (`product-grid`, `product-card`)
- contract audit result: `passed` (`npm run element:audit`)

## Remaining risks and debt

- The effective `shop` contract in `Synergos.CMS.Web` has diverged from the earlier UI canonic model in several additive fields and aliases:
  - `cardLayout` vs `layout`
  - `categoryFilter` / `sortBy` vs `categoryAlias` / `sortOrder`
  - `summaryTitle` / `checkoutEndpoint`
  - `minQty` / `maxQty` / `initialQty`
  - `variantsJson` / `selectedValue`
  - `variantKey` as a direct visual key
- UI was hardened to absorb those names as compatibility aliases in contracts, mappers, and selected Angular shop components without replacing the canonical contract.
- Rendering resolution was also hardened so selector lookup no longer depends on a single exact string:
  - registry entries now keep richer metadata (`name`, `tier`, `source`)
  - resolver failures now report attempted lookup keys and registered entry count
  - registry lookups can resolve through normalized selector/tag/name candidates when available
- Generic config/input boundaries were hardened:
  - `coerceConfigInput` now rejects non-object JSON payloads consistently and drops `undefined` keys from direct objects
  - runtime attribute mapping now validates attribute names and serializes non-string values explicitly instead of assuming every input is already a safe string
- Many legacy components still rely on component-level dark modifiers and Sass palette values.
- Demo HTML files still carry hardcoded colors for local preview chrome.
- Some modules with strong custom styling remain outside this pass, notably several experience-tier and untouched composition/module surfaces.
- Full multi-theme harmonization is not finished until the remaining `--dark` selectors are converted into root-driven component tokens.
- Angular linting in domains still shows pre-existing workspace issues (`tsconfig.base.json` lookup and module-boundary rules on relative imports), so style hardening is validated via build but not fully via lint in affected projects.
- `shop` runtime config is now materially safer at the component edge:
  - `product-card`, `product-grid`, `product-detail`, `cart-summary`, `quantity-selector`, and `variant-picker` no longer ingest raw `config` objects directly
  - each of those components now normalizes high-risk fields (enum-like strings, booleans, numeric bounds, translation records) before resolution
  - this reduces silent acceptance of malformed CMS/runtime payloads without breaking additive alias compatibility already introduced
- the same hardening pattern is now extended to higher-risk non-shop surfaces with external integration characteristics:
  - `newsletter-form`
  - `iframe-embed`
  - `external-widget`
  - `script-embed`
- host-style integration surfaces are now also hardened at config ingress:
  - `angular-host`
  - `mf-host`
  - `macro-host`
- current validation for `external-widget` and `script-embed` is partially blocked by a pre-existing `core:build` `rootDir` / Angular ngtypecheck issue, but their local lint remains green and the new sanitization layer is isolated to component config ingress
- the same pre-existing `core:build` blocker also prevents full build validation for `angular-host`, `mf-host`, and `macro-host`; local lint is green and the component-level hardening is isolated from that build debt

- the last two `shop` composition surfaces that still accepted raw `config` objects directly are now aligned with the hardened ingress pattern:
  - `price-display` now sanitizes `showOriginalPrice`, `showDiscount`, `priceSize`, `currency`, `theme`, `variant`, and `translations`
  - `cart-item` now sanitizes CMS/runtime config fields before resolution and supports `config.item` as a typed fallback instead of declaring it without consuming it

- `shared` quedó bastante más consistente en su borde de config runtime:
  - primitives endurecidos: `button`, `heading`, `badge`, `link`, `icon`, `status-tag`, `spinner`, `progress`, `list`
  - reusable higher-level surfaces endurecidas: `section`, `accordion`, `overview-card`, `pricing-card`
- estos componentes ya no aceptan `config` plano sin filtrar:
  - enums inválidos ahora se descartan explícitamente
  - strings se normalizan con trim
  - booleans y numbers se coercionan de forma segura
  - estructuras de arrays/objetos (`items`, `details`, `highlights`) ahora se validan antes de entrar al componente
- en `platforms/angular/libs/shared/src/components` ya no quedan `transform: coerceConfigInput<...>` directos; la deuda restante de ese patrón se concentra en `apps/elements` y `experiences`
- validación de `shared` por `tsconfig.lib.json` sigue bloqueada por una deuda del propio workspace (`inlineSources` sin `sourceMap`), no por esta wave

- `apps/elements/modules` avanzó otra ola fuerte de hardening:
  - endurecidos con sanitización explícita: `data-table`, `banner-slider`, `tab-group`, `testimonial-section`, `logo-cloud`
- en esos módulos ya no se depende de lecturas crudas desde `config` para campos efectivos del runtime
- se introdujeron tipos locales de runtime compat donde el componente ya consumía campos no modelados en el contrato publicado (`autoplay`, `loop`, `activeId`, `columns`, flags de data-table)
- esto elimina deuda escondida: antes esos campos existían solo de facto en lógica con `Record<string, unknown>`; ahora quedan trazados en tipos locales y saneados antes del render
- estado residual actualizado:
  - `platforms/angular/apps/elements/modules`: quedan `5` usos de `coerceConfigInput` plano
  - `platforms/angular` completo: quedan `35` usos de `coerceConfigInput` plano

- `apps/elements/modules` quedó completamente limpio de `transform: coerceConfigInput<...>` plano
- endurecidos en esta wave:
  - `hero`
  - `faq-section`
  - `feature-grid`
  - `section`
  - `banner`
- mejoras relevantes de esta pasada:
  - `section` ahora sí resuelve layout-related config desde `config`, no solo desde atributos directos
  - `banner` ahora reconoce y sanea campos efectivos que ya usaba en runtime pero no estaban modelados (`eyebrow`, `imageSrc`, `imageAlt`, `secondaryCta*`)
  - `feature-grid` ya puede resolver `columns` desde config saneado, en vez de ignorarlo
  - `faq-section` filtra payloads malformados de items antes del render
- estado residual actualizado:
  - `platforms/angular/apps/elements/modules`: `0` usos planos restantes
  - `platforms/angular` completo: `30` usos planos restantes

- hito de hardening alcanzado: en `platforms/angular` ya no quedan usos de `transform: coerceConfigInput<...>` plano
- se completó el barrido por capas:
  - `shared/components`
  - `apps/domains/shop`
  - `apps/elements/modules`
  - `apps/elements/primitives`
  - `apps/elements/compositions`
  - `apps/experiences`
- el borde Angular ahora entra por sanitización explícita en todo ese alcance, incluyendo:
  - strings con trim
  - booleans/numbers coercionados
  - unions cerradas normalizadas
  - arrays y objetos compuestos validados antes de llegar al render
- lo que queda como deuda principal ya no es `config` plano, sino:
  - aliases/registry legacy en auditoría de contratos
  - campos efectivos de runtime que todavía convendría subir desde tipos locales de compatibilidad hacia contratos públicos canónicos cuando corresponda
  - validación más profunda de payloads complejos en algunos adapters/experiences

## Wave 2026-04-25 - Shared + Apps UX uplift
- Shared design system now has stronger semantic surfaces for modal, accordion, filter-panel, overview-card, pricing-card, data-table and social-links.
- Angular apps modules were aligned to that visual language: hero, banner, feature-grid, faq-section, testimonial-section, logo-cloud and data-table.
- Angular apps compositions were also refined where visual density was still weak: card, media-text, gallery-item and button-group.
- Main UX gains: clearer section headers, better spacing hierarchy, stronger panel/card surfaces, more coherent hover states, and cleaner CTA grouping.


## Final SCSS closure - apps/angular
- Remaining residual SCSS debt in elements, primitives and experiences was normalized to semantic surfaces and theme-aware variables.
- Final sweep found no remaining gb(...), gba(...) or hex literals in platforms/angular/apps/elements/**/*.scss or platforms/angular/apps/experiences/**/*.scss.


## Wave 17 - Experiences UX and Slider Semantics
- media-explorer, eature-journey and insight-explorer no longer depend on hardcoded operational labels in templates.
- Labels for filters, navigation, metrics, player regions and empty states now resolve from 	ranslations with explicit fallbacks.
- Broken glyph/encoding artifacts in experience templates were replaced with stable entities and readable defaults.
- anner-slider moved the remaining direct Sass palette usage to semantic theme variables and added a translatable carousel aria contract.
