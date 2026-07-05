// Public API Surface of @synergos/shells
//
// The cross-domain shell catalogue (doc 21 §1.3, contrato D3): each shell is
// built ONCE here and specialised per domain via config + templates +
// strategies (OCP). No shell knows "producto/hotel/curso" — domains feed data
// and templates in, and plug their `IFulfillmentStrategy` into the engine.
//
//  - SH-1 `syn-discovery-shell`  — search + facets + templated results + sort + pagination
//  - SH-2 `syn-detail-shell`     — gallery + specs + reviews/Q&A slots + sticky CTA + related
//  - SH-3 `syn-checkout-wizard`  — configurable multi-step checkout over the transaction engine
//  - SH-4 `syn-account-shell`    — "mis X" inbox + custom sections + `syn-tracking-timeline`

// ─── SH-1 Discovery ──────────────────────────────────────────────────────────
export {
  DiscoveryShellComponent,
  type DiscoveryCriteria,
  type DiscoveryFacet,
  type DiscoveryFacetValue,
  type DiscoveryItemContext,
  type DiscoveryShellConfig,
  type DiscoverySortOption,
} from './discovery/discovery-shell';

// ─── SH-2 Detail ─────────────────────────────────────────────────────────────
export {
  DetailShellComponent,
  type DetailMedia,
  type DetailShellConfig,
  type DetailSpec,
} from './detail/detail-shell';

// ─── SH-3 Checkout wizard ────────────────────────────────────────────────────
export {
  CheckoutWizardComponent,
  type CheckoutStepContext,
  type CheckoutWizardConfig,
  type CheckoutWizardResult,
  type CheckoutWizardStep,
} from './checkout/checkout-wizard';

// ─── SH-4 Account ────────────────────────────────────────────────────────────
export {
  AccountShellComponent,
  type AccountDetailContext,
  type AccountItemContext,
  type AccountSection,
  type AccountSectionContext,
  type AccountShellConfig,
} from './account/account-shell';
export {
  TrackingTimelineComponent,
  type TrackingStage,
} from './account/tracking-timeline';
