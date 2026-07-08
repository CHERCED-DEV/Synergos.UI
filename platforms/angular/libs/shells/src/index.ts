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
//  - SH-5 `syn-console-shell`    — cara B: KPI dashboard + sectioned data-table/queue + reports
//  - SH-6 `syn-authoring-wizard` — publicar/crear entidad: form stepper + persistent draft
//  - SH-7 `syn-message-center`   — v1: conversation-list + thread + reply composer
//  - SH-8 `syn-results-map`      — geo tiles + clustering + viewport sync
//  - SH-9 `syn-dynamic-form`     — schema-driven task-list + multi-step + check-answers + error summary
//  - SH-10 `syn-credential-wallet` — signed QR credential + public verify + transfer

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

// ─── SH-5 Console ────────────────────────────────────────────────────────────
export {
  ConsoleShellComponent,
  type ConsoleCellContext,
  type ConsoleColumn,
  type ConsoleFilter,
  type ConsoleKpi,
  type ConsoleReportsContext,
  type ConsoleRowAction,
  type ConsoleRowActionEvent,
  type ConsoleSection,
  type ConsoleSectionContext,
  type ConsoleShellConfig,
} from './console/console-shell';

// ─── SH-6 Authoring wizard ───────────────────────────────────────────────────
export {
  AuthoringWizardComponent,
  type AuthoringDraft,
  type AuthoringStep,
  type AuthoringStepContext,
  type AuthoringWizardConfig,
} from './authoring/authoring-wizard';

// ─── SH-7 Message center ─────────────────────────────────────────────────────
export {
  MessageCenterComponent,
  type MessageCenterConfig,
  type MessageDetailContext,
  type MessageSendEvent,
  type MessageThreadContext,
} from './messaging/message-center';

// ─── SH-8 Results map ────────────────────────────────────────────────────────
export {
  ResultsMapComponent,
  type GeoBounds,
  type GeoPoint,
  type ResultsMapConfig,
  type ResultsMapItemContext,
  type ResultsMapLayout,
} from './map/results-map';

// ─── SH-9 Dynamic form ───────────────────────────────────────────────────────
export {
  DynamicFormShellComponent,
  type DynamicFieldOption,
  type DynamicFieldType,
  type DynamicFormAnswers,
  type DynamicFormChange,
  type DynamicFormConfig,
  type DynamicFormField,
  type DynamicFormSection,
  type DynamicFormSubmit,
  type FormSchema,
  type TaskStatus,
} from './forms/dynamic-form-shell';

// ─── SH-10 Credential wallet ─────────────────────────────────────────────────
export {
  CredentialWalletComponent,
  type CredentialField,
  type CredentialStatus,
  type CredentialTone,
  type CredentialWalletConfig,
  type CredentialWalletContext,
  type WalletCredential,
} from './credentials/credential-wallet';

// ─── State components ─────────────────────────────────────────────────────────
// The ViewState contract (loading|ready|empty|error|degraded) + the four
// tokenised state surfaces every data shell composes (doc 22 §6). Built once
// here, framework-free of any domain; Fase 2 wires them into the shells above.
export { type ViewState } from './states/view-state';
export { SynSkeletonComponent, type SkeletonVariant } from './states/skeleton';
export { SynEmptyStateComponent, type EmptyStateKind } from './states/empty-state';
export { SynErrorStateComponent } from './states/error-state';
export { SynStatusBannerComponent, type StatusBannerTone } from './states/status-banner';
