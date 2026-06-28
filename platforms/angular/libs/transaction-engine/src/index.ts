// Public API Surface of @synergos/transaction-engine
//
// The unified transactional engine of the Synergos UI — the trio ported from
// NewShore (Orchestrator + SessionStore + EventBus) plus the Fulfillment Strategy
// seam, rewritten Angular ~21 zoneless + signals, no RxJS, no NgRx.

// ─── Domain model ────────────────────────────────────────────────────────────
export {
  CLEAN_PRICING,
  CLEAN_SESSION_DATA,
  type DateTimePair,
  type IsoDateTime,
  type PriceLine,
  type Pricing,
  type SessionData,
  type SessionItem,
  type SessionItemKind,
  type SessionParty,
  type SessionPayment,
  type SessionStatus,
} from './models/session-data';

// ─── Orchestrator ────────────────────────────────────────────────────────────
export {
  OrchestratorService,
  type RequestTask,
  type SubmitTask,
  type WidgetRegistration,
  type WidgetStatus,
} from './services/orchestrator.service';

// ─── Session store (unified cart) ────────────────────────────────────────────
export {
  SessionStore,
  type SessionReconciler,
  type SessionStoreConfig,
} from './services/session-store.service';

// ─── Typed, instance-scoped event bus ────────────────────────────────────────
export {
  TransactionEventBusService,
  type TransactionEvent,
  type TransactionEventListener,
  type TransactionEventMap,
} from './services/transaction-event-bus.service';

// ─── Fulfillment strategy seam ───────────────────────────────────────────────
export {
  FulfillmentStrategyBase,
  type FulfillmentConfirmation,
  type FulfillmentPayRequest,
  type FulfillmentPayResult,
  type FulfillmentProduct,
  type FulfillmentSearchQuery,
  type FulfillmentSelection,
  type FulfillmentVoucher,
  type IFulfillmentStrategy,
} from './strategies/fulfillment-strategy';
export {
  FULFILLMENT_STRATEGIES,
  FulfillmentStrategyProvider,
} from './strategies/fulfillment-strategy.provider';
export {
  FulfillmentContext,
  NoFulfillmentStrategyError,
} from './strategies/fulfillment.context';
