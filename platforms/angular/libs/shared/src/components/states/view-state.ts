/**
 * State contract for every data surface (doc 22 §6, bucket "Estados & feedback").
 *
 * Designing only `'ready'` is the error of origin: each surface that loads data
 * must declare its states as an **explicit contract**, not resolve them ad-hoc
 * per app. In Fase 2 the reusable shells (discovery / console / account /
 * data-grid) will expose a `viewState` input of this type and compose the four
 * state components below (`syn-skeleton`, `syn-empty-state`, `syn-error-state`,
 * `syn-status-banner`) instead of emitting `<p>Cargando…</p>`.
 *
 *  - `loading`  → resolving; render `syn-skeleton` (1:1 layout mould, zero CLS).
 *  - `ready`    → data present; render the real content.
 *  - `empty`    → confirmed `count === 0`; render `syn-empty-state`.
 *  - `error`    → the load failed; render `syn-error-state` (inline retry).
 *  - `degraded` → serving sample/demo/stale data; render `syn-status-banner`
 *                 **alongside** the content (it is a banner, not a takeover).
 */
export type ViewState = 'loading' | 'ready' | 'empty' | 'error' | 'degraded';
