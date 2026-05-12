# 05 Validation Checklist

## Executed validation in this increment

- `npm.cmd run element:audit` : passed (contract audit with warnings only, no breaking issues)
- `nx.cmd run-many --target=build --projects=domains-shop-product-grid,domains-shop-product-card --excludeTaskDependencies --outputStyle=static` : passed
- `nx.cmd run-many --target=lint --projects=domains-shop-product-grid,domains-shop-product-card --excludeTaskDependencies --outputStyle=static` : passed
- `nx.cmd run-many --target=build --projects=domains-shop-product-grid,domains-shop-product-detail --excludeTaskDependencies --outputStyle=static` : passed
- `nx.cmd run-many --target=lint --projects=domains-shop-product-grid,domains-shop-product-detail --excludeTaskDependencies --outputStyle=static` : partial (`domains-shop-product-grid` passes; `domains-shop-product-detail` fails on pre-existing `tsconfig.base.json` resolver + module-boundary relative imports)
- `rg -n "#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgb\\(|rgba\\(" platforms/angular/apps/domains/shop --glob "*.scss"` : passed with no matches after Wave 14 token fallback cleanup
- `nx.cmd run-many --target=build --projects=domains-shop-price-display,domains-shop-quantity-selector,domains-shop-variant-picker,domains-shop-cart-item,domains-shop-product-grid,domains-shop-product-card,domains-shop-product-detail,domains-shop-cart-summary --excludeTaskDependencies --outputStyle=static` : passed
- `nx.cmd run-many --target=lint --projects=domains-shop-price-display,domains-shop-quantity-selector,domains-shop-variant-picker,domains-shop-cart-item,domains-shop-product-grid,domains-shop-product-card,domains-shop-product-detail,domains-shop-cart-summary --excludeTaskDependencies --outputStyle=static` : partial (`price-display`, `quantity-selector`, `variant-picker`, `product-grid`, `product-card` pass; `cart-item`, `cart-summary`, `product-detail` fail on pre-existing `tsconfig.base.json` resolver + module-boundary relative import violations)
- `npx.cmd nx run-many --target=build --projects=domains-shop-product-grid,domains-shop-product-detail,domains-shop-variant-picker,domains-shop-product-card --excludeTaskDependencies --outputStyle=static` : passed
- `npx.cmd nx run-many --target=lint --projects=domains-shop-product-grid,domains-shop-variant-picker,domains-shop-product-card --excludeTaskDependencies --outputStyle=static` : passed
- `npx.cmd nx run domains-shop-product-detail:lint --excludeTaskDependencies --outputStyle=static` : partial fail on pre-existing workspace/module-boundary blockers (`tsconfig.base.json` resolver + relative import constraints)
- `npx.cmd nx run shared:build --excludeTaskDependencies --outputStyle=static` : passed
- `npx.cmd nx run shared:test --excludeTaskDependencies --outputStyle=static` : passed (`69` files / `159` tests)
- `npx.cmd nx run shared:lint --excludeTaskDependencies --outputStyle=static` : passed
- `npx.cmd nx run-many --target=build --projects=domains-shop-cart-summary,domains-shop-cart-item,domains-shop-quantity-selector --excludeTaskDependencies --outputStyle=static` : passed
- `npx.cmd nx run-many --target=test --projects=domains-shop-cart-summary,domains-shop-cart-item,domains-shop-quantity-selector --excludeTaskDependencies --outputStyle=static` : no-op (`3` projects without configured `test` target)
- `npx.cmd nx run-many --target=lint --projects=domains-shop-cart-summary,domains-shop-cart-item,domains-shop-quantity-selector --excludeTaskDependencies --outputStyle=static` : partial (`domains-shop-quantity-selector` passes; `cart-summary` and `cart-item` fail on pre-existing workspace/module-boundary lint blockers)
- `nx.cmd run shared:build --excludeTaskDependencies --outputStyle=static` : passed
- `nx.cmd run shared:test --excludeTaskDependencies --outputStyle=static` : passed (`69` files / `159` tests)
- `nx.cmd run shared:lint --excludeTaskDependencies --outputStyle=static` : passed
- `nx.cmd run-many --target=build --projects=shared,domains-shop-product-detail,domains-shop-variant-picker --excludeTaskDependencies --outputStyle=static` : passed
- `nx.cmd run-many --target=test --projects=shared,domains-shop-product-detail,domains-shop-variant-picker --excludeTaskDependencies --outputStyle=static` : partial (only `shared` has configured test target; passed `69` files / `157` tests)
- `nx.cmd run-many --target=lint --projects=shared,domains-shop-product-detail,domains-shop-variant-picker --excludeTaskDependencies --outputStyle=static` : partial (`shared` and `domains-shop-variant-picker` pass; `domains-shop-product-detail` still fails on pre-existing workspace/module-boundary lint issues)
- `nx.cmd run shared:lint --excludeTaskDependencies --outputStyle=static` : passed
- `nx.cmd run-many --target=build --projects=shared,elements-modules-faq-section,elements-compositions-logo-item,elements-modules-tab-group,elements-modules-data-table,domains-shop-product-card --excludeTaskDependencies --outputStyle=static` : passed
- `nx.cmd run-many --target=test --projects=elements-modules-faq-section,elements-compositions-logo-item,elements-modules-tab-group,elements-modules-data-table,domains-shop-product-card --excludeTaskDependencies --outputStyle=static` : partial (all configured test targets passed; `domains-shop-product-card` has no test target configured)
- `nx.cmd run shared:test --excludeTaskDependencies --outputStyle=static` : passed (`69` files / `157` tests)
- `nx.cmd run-many --target=lint --projects=shared,elements-modules-faq-section,elements-compositions-logo-item,elements-modules-tab-group,elements-modules-data-table,domains-shop-product-card --excludeTaskDependencies --outputStyle=static` : partial (5 pass, `shared` fails on pre-existing `primitives/list` accessibility lint findings)
- `npx.cmd nx run-many --target=build --projects=shared,elements-modules-hero,elements-modules-banner,elements-compositions-card --parallel=1 --outputStyle=static --skip-nx-cache` : passed
- `npx.cmd nx run elements-modules-hero:build --outputStyle=static --skip-nx-cache` : passed after final hero token cleanup
- `npx.cmd nx run elements-modules-section:build --outputStyle=static --skip-nx-cache` : passed
- `npx.cmd nx run elements-compositions-info-block:build --outputStyle=static --skip-nx-cache` : passed
- `npx.cmd nx run elements-compositions-feature-item:build --outputStyle=static --skip-nx-cache` : passed
- `npx.cmd nx run elements-modules-feature-grid:build --excludeTaskDependencies --outputStyle=static --skip-nx-cache` : passed
- `npx.cmd nx run elements-modules-testimonial-section:build --excludeTaskDependencies --outputStyle=static --skip-nx-cache` : passed
- `npx.cmd nx run-many --target=test --projects=elements-modules-section,elements-modules-feature-grid,elements-modules-testimonial-section,elements-compositions-info-block,elements-compositions-feature-item --parallel=1 --outputStyle=static --skip-nx-cache` : passed
- `nx.cmd run-many --target=build --projects=domains-shop-product-card,domains-shop-product-detail,domains-shop-cart-summary --excludeTaskDependencies --outputStyle=static` (from `platforms/angular`) : passed
- `nx.cmd run domains-shop-product-card:build:production --excludeTaskDependencies --outputStyle=static` : passed (after resolving stale token names in `product-card.scss`)
- `nx.cmd run-many --target=build --projects=domains-shop-price-display,domains-shop-quantity-selector,domains-shop-variant-picker,domains-shop-cart-item,domains-shop-product-grid,domains-shop-product-card,domains-shop-product-detail,domains-shop-cart-summary --excludeTaskDependencies --outputStyle=static` : passed
- `nx.cmd run-many --target=lint --projects=domains-shop-price-display,domains-shop-quantity-selector,domains-shop-variant-picker,domains-shop-cart-item,domains-shop-product-grid --excludeTaskDependencies --outputStyle=static` : partial (4 pass, `cart-item` fails on pre-existing module-boundary lint rules)
- `nx.cmd run-many --target=build --projects=shared,elements-compositions-newsletter-form,elements-compositions-social-share,elements-compositions-key-value --excludeTaskDependencies --outputStyle=static` : passed
- `nx.cmd run shared:test --excludeTaskDependencies --outputStyle=static` : passed
- `nx.cmd run-many --target=test --projects=elements-compositions-newsletter-form,elements-compositions-social-share,elements-compositions-key-value --excludeTaskDependencies --outputStyle=static` : passed
- `nx.cmd run-many --target=lint --projects=shared,elements-compositions-newsletter-form,elements-compositions-social-share,elements-compositions-key-value --excludeTaskDependencies --outputStyle=static` : partial (3 pass, `shared` fails on pre-existing lint errors in `libs/shared/src/components/primitives/list/list.ts`)
- `npx.cmd nx run-many -t build -p elements-compositions-faq-item,elements-compositions-media-text,elements-compositions-timeline-item --excludeTaskDependencies` : passed
- `npx.cmd nx run-many -t test -p elements-compositions-faq-item,elements-compositions-media-text,elements-compositions-timeline-item --excludeTaskDependencies` : initially failed on `elements-compositions-faq-item` due pre-existing config drift (`initiallyExpanded` ignored from `config`), then passed after contract + resolver fix
- `npx.cmd nx run elements-compositions-faq-item:test` : passed after fix (`4/4`)
- `npx.cmd nx run-many -t lint -p elements-compositions-faq-item,elements-compositions-media-text,elements-compositions-timeline-item --excludeTaskDependencies` : passed
- `npx.cmd nx run-many -t build -p elements-modules-faq-section,elements-compositions-testimonial-item,elements-modules-testimonial-section --excludeTaskDependencies` : passed
- `npx.cmd nx run-many -t test -p elements-modules-faq-section,elements-compositions-testimonial-item,elements-modules-testimonial-section --excludeTaskDependencies` : passed
- `npx.cmd nx run-many -t lint -p elements-modules-faq-section,elements-compositions-testimonial-item,elements-modules-testimonial-section --excludeTaskDependencies` : passed
- `npm.cmd run cms:validate` : failed with pre-existing CMS/registry alias mismatches (`39` errors, mostly registry aliases missing in CMS and legacy CMS aliases missing in registry)

## Build checklist

- shared library builds cleanly
- updated element modules build cleanly
- updated shop components (`product-card`, `product-detail`, `cart-summary`) build cleanly
- SCSS token changes do not break Angular compilation
- component API additions remain additive
- `faq-item` now correctly consumes `initiallyExpanded` from typed `config`

Known workspace blocker:

- Full dependency-aware build for `elements-modules-feature-grid` and `elements-modules-testimonial-section` still fails at `core:build` with `TS6059` (`vitals/contracts` path/rootDir issue), pre-existing and not introduced by this styling refinement.
- Linting for some shop domain projects still fails due pre-existing workspace issues:
  - missing `platforms/angular/tsconfig.base.json` resolution in lint pipeline
  - existing `@nx/enforce-module-boundaries` violations on relative imports in untouched TypeScript files
  - `domains-shop-cart-item:lint` still reports relative import violations (`quantity-selector` and `cart.store`) unrelated to this styling migration
- Shared lint findings previously concentrated in `primitives/list` were resolved in Wave 10; current blocking lint debt in this validation slice is centered on pre-existing `domains-shop-product-detail` workspace/module-boundary issues.
- `cms:validate` still reports pre-existing cross-repo contract drift (`E1`/`E2` alias mismatches) not introduced by this styling wave.
- Shop lint continues to fail for pre-existing reasons outside styling scope:
  - missing `platforms/angular/tsconfig.base.json` in lint resolver path
  - existing relative import module-boundary violations in `cart-item` and `cart-summary` TypeScript wiring
  - existing relative import module-boundary violations in `product-detail` TypeScript wiring (`price-display`, `quantity-selector`, `variant-picker` imports)

## Theming checklist

- `light` resolves readable surfaces, text, borders, and actions
- `dark` switches `color-scheme` and semantic tokens coherently
- `silver-gold` resolves premium warm neutrals and restrained metallic emphasis
- components can inherit from `:root`, `[data-theme]`, `[theme]`, or `.theme-*`
- legacy `--sg-*` CMS variables still feed the new contract

## Root to Angular checklist

- root/container variables cascade into Angular elements
- shared components consume semantic variables instead of palette values where migrated
- local component theme classes are only compatibility overrides, not the primary architecture

## Interaction checklist

- focus-visible is clearly visible in all three themes
- disabled buttons remain legible and distinct
- invalid inputs now have a reachable API state
- buttons expose the visual variants that existed in styling
- icon buttons now expose all shipped visual variants/sizes (`filled|outline|ghost|danger`, `sm|md|lg`)

## Visual quality checklist

- buttons have clearer lift, border, and emphasis hierarchy
- inputs read as enterprise form controls, not bare browser wrappers
- cards, panels, and sections have consistent surface language
- hero and banner read as premium system surfaces rather than isolated custom styling

## Responsive checklist

- hero and banner preserve spacing rhythm on mobile and desktop
- cards keep proportional hover and spacing behavior without overflow regression
- section and panel spacing scales remain predictable

## Remaining manual validation recommended

- verify end-to-end `shop` config hydration using current `Synergos.CMS.Web` field names:
  - `cardLayout`
  - `categoryFilter`
  - `sortBy`
  - `summaryTitle`
  - `checkoutEndpoint`
  - `minQty` / `maxQty` / `initialQty`
  - `variantsJson` / `selectedValue`
- verify rendering lookup diagnostics with invalid selectors:
  - empty selector
  - unknown CMS alias
  - valid custom element tag used as lookup key
- verify generic input/config hardening:
  - invalid JSON config string is ignored safely
  - JSON arrays are rejected for object-style `config`
  - `undefined` keys are not leaked into config objects
  - invalid attribute names are skipped instead of mounted blindly
- verify shop component config sanitization:
  - invalid `layout`, `sortOrder`, `sortBy`, `variantType`, and `displayAs` values fall back cleanly
  - malformed `translations` payloads do not leak non-string values into components
  - invalid numeric ranges for quantity selector (`min`, `max`, `step`, `initialQty`) are normalized safely
- verify embed/form config sanitization:
  - newsletter `method` only resolves to supported verbs and ignores malformed values
  - iframe config ignores malformed `allowFullscreen` and trims `src` / `title` / `height`
  - external widget config trims `src`, `type`, `title`, and `endpoint` before mount
  - script embed config trims script definition inputs and does not leak malformed translation payloads
- verify host config sanitization:
  - `angular-host` trims `component` / `endpoint` and only accepts string-valued `params`
  - `mf-host` trims `remoteEntry` / `exposedModule` / `endpoint` and only accepts string-valued `params`
  - `macro-host` trims `contentType` and only accepts object-shaped `contentData`
- known blocker:
  - `external-widget`, `script-embed`, `angular-host`, `mf-host`, and `macro-host` build verification can still be blocked by pre-existing `core:build` `rootDir` / ngtypecheck drift in `platforms/angular/libs/core`
- inspect the three themes in browser with real CMS or preview hosts
- verify contrast for premium silver-gold against actual brand content and imagery
- review untouched legacy modules under dark and silver-gold to prioritize the next migration wave

- verify `price-display` ignores malformed `priceSize`, `showOriginalPrice`, `showDiscount`, and non-string translation payloads
- verify `cart-item` works with either direct `[item]` binding or `config.item`, and ignores malformed cart item objects safely
- note: direct `eslint` CLI invocation is not a valid workspace validation path here because the repo is configured around Nx/executor-driven linting; use project targets or direct TypeScript compilation instead

- verify `shared` primitives reject malformed config enums and keep safe fallbacks:
  - `button.variant/size/type`
  - `heading.level/size/tone/align`
  - `badge.tone`
  - `link.tone`, `target`, `rel`, `disabled`
  - `icon.size/tone/decorative`
  - `status-tag.tone/style`
  - `spinner.size/tone`
  - `progress.size/variant/value/max/showLabel/indeterminate`
- verify structured shared config sanitization:
  - `list.items` ignores malformed entries without `label`
  - `overview-card.details` ignores malformed objects without `term` and `description`
  - `pricing-card.highlights` ignores empty/non-string entries and preserves valid strings
- known workspace blocker:
  - `platforms/angular/libs/shared/tsconfig.lib.json` cannot currently be used for validation because it sets `inlineSources` without `sourceMap`/`inlineSourceMap`

- verify hardened module config ingress:
  - `data-table` normalizes `columns`, `headers`, `rows`, and boolean flags from config safely
  - `banner-slider` now respects config-driven `autoplay` and `loop` instead of silently ignoring them
  - `tab-group` resolves `activeId` and `tabs` from sanitized config instead of raw record access
  - `testimonial-section` ignores malformed testimonial entries without `name` or `quote`
  - `logo-cloud` normalizes `columns` and `items` from config safely
- validation executed for this wave:
  - `tsc -p .../data-table/tsconfig.app.json --noEmit`: OK
  - `tsc -p .../banner-slider/tsconfig.app.json --noEmit`: OK
  - `tsc -p .../tab-group/tsconfig.app.json --noEmit`: OK
  - `tsc -p .../testimonial-section/tsconfig.app.json --noEmit`: OK
  - `tsc -p .../logo-cloud/tsconfig.app.json --noEmit`: OK

- validation executed for this module wave:
  - `tsc -p .../hero/tsconfig.app.json --noEmit`: OK
  - `tsc -p .../faq-section/tsconfig.app.json --noEmit`: OK
  - `tsc -p .../feature-grid/tsconfig.app.json --noEmit`: OK
  - `tsc -p .../section/tsconfig.app.json --noEmit`: OK
  - `tsc -p .../banner/tsconfig.app.json --noEmit`: OK
- verify behavior shifts introduced intentionally:
  - `section` now honors config-based layout props (`headingText`, `headingLevel`, `containerType`, `alignment`, `direction`, `margin`, `padding`, `gap`)
  - `feature-grid` now honors config-based `columns`
  - `banner` now honors config-based secondary CTA and image metadata when provided

- milestone validation executed:
  - `platforms/angular`: `0` matches for `transform: coerceConfigInput<...>`
  - validated batches with `tsc -p .../tsconfig.app.json --noEmit` across `shop`, `elements/modules`, `elements/primitives`, `elements/compositions`, and `experiences`
  - `npm.cmd run element:audit`: OK with only pre-existing registry/model warnings

## Validation update - 2026-04-25
- shared:test: PASS after shared design-system refinement.
- element:audit: PASS after shared and app-level UX waves.
- Elements modules tests validated in this wave:
  - hero: PASS
  - banner: PASS
  - feature-grid: PASS
  - faq-section: PASS
  - testimonial-section: PASS
  - data-table: PASS
  - logo-cloud: PASS from Nx local cache; runner emitted plugin-worker noise but target resolved successfully.
- Elements compositions tests validated in this wave:
  - card: PASS
  - media-text: PASS
  - gallery-item: PASS
  - button-group: PASS


- Closing wave validations:
  - elements-compositions-alert-bar: PASS
  - elements-compositions-social-share: PASS
  - elements-compositions-newsletter-form: PASS
  - element:audit: PASS after alert-bar contract alignment.


- Final SCSS sweep:
  - No gb/rgba/hex literals remain under platforms/angular/apps/elements/**/*.scss.
  - No gb/rgba/hex literals remain under platforms/angular/apps/experiences/**/*.scss.
  - element:audit: PASS after final SCSS closure.


## Wave 17 Validation
- Local 	sc passed for media-explorer, eature-journey, insight-explorer and anner-slider using the workspace compiler.
- element:audit passed after the translation/ARIA refinements.
- Production builds pass for the three experiences targets.
- un-many build still fails globally due pre-existing core:build ootDir issues in itals/contracts generated Angular typecheck files.
