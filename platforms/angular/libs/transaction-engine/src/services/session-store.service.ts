import { Injectable, type Signal, computed, inject, signal } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  CLEAN_SESSION_DATA,
  type Pricing,
  type SessionData,
  type SessionItem,
} from '../models/session-data';

/** Options to scope and time-bound a session store instance. */
export interface SessionStoreConfig {
  /**
   * Storage key scope — typically the `siteRoot` ("one deploy = one origin").
   * The final key is `syn.txn.session.<scope>`.
   */
  readonly scope: string;
  /** Transactional flow this session represents (`'booking'`, `'storefront'`…). */
  readonly flow: string;
  /** Time-to-live in ms before the whole session expires. Default 30 min. */
  readonly ttlMs?: number;
  /** Currency for a freshly-created session. Default `COP`. */
  readonly currency?: string;
}

/**
 * Reconciliation hook: given the local session, return the authoritative server
 * session. The store treats the server as the source of truth and the local copy
 * as an optimistic cache (NewShore's `getApiSession`/`ReloadBooking`). Optional —
 * pure-client demos run without it.
 */
export type SessionReconciler = (local: SessionData) => Promise<SessionData>;

const KEY_PREFIX = 'syn.txn.session';
const DEFAULT_TTL_MS = 30 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * **Unified multi-item cart store** — the heart of every transaction.
 *
 * Generalises NewShore's `SessionStore`/`session.service.ts` (637 lines, NgRx-
 * coupled) into a zoneless, **signals-only** store with **no NgRx and no RxJS**:
 *
 *  - **Multi-item cart** of heterogeneous `SessionItem`s behind one `Pricing`.
 *  - **TTL/expiration**: `expiresAt` on the tree; `getValidSession` collapses an
 *    expired or corrupt tree to `CLEAN_SESSION_DATA`.
 *  - **`localStorage` persistence scoped by origin** (`scope` → `siteRoot`), key
 *    configurable.
 *  - **Multi-tab protection**: a `tabId` is stamped on the session; the `storage`
 *    event broadcasts cross-tab writes, and `liveSessionConflict` flips `true`
 *    when another tab takes ownership of the same scope (NewShore
 *    `checkLiveSession`/`errorLiveSession`, modernised — no redirect baked in;
 *    the consumer decides).
 *  - **API reconciliation hook** (`reconcile`): optimistic local, authoritative
 *    server.
 *
 * The store is created per island. It is `providedIn: 'root'` but **must be
 * `init(...)`-ed** with a scope before use; until then it serves `CLEAN_SESSION_DATA`.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  readonly #logger = inject(LoggerService);

  /** Unique id for this browser tab — multi-tab ownership token. */
  readonly tabId = newId('tab');

  readonly #session = signal<SessionData>(CLEAN_SESSION_DATA);
  readonly #liveConflict = signal(false);
  readonly #config = signal<SessionStoreConfig | null>(null);

  #reconciler: SessionReconciler | null = null;
  #storageListener: ((event: StorageEvent) => void) | null = null;

  /** The current session tree (always a valid, non-expired snapshot to read). */
  readonly session: Signal<SessionData> = this.#session.asReadonly();

  /** The cart lines. */
  readonly items = computed(() => this.#session().items);

  /** Number of lines in the cart. */
  readonly itemCount = computed(() => this.#session().items.length);

  /** Aggregate pricing. */
  readonly pricing = computed(() => this.#session().pricing);

  /** `true` once at least one line exists. */
  readonly hasItems = computed(() => this.#session().items.length > 0);

  /** `true` when another tab has claimed this scope's session. */
  readonly liveSessionConflict = this.#liveConflict.asReadonly();

  /** `true` when the persisted session is still within its TTL. */
  readonly isLive = computed(() => !this.isExpired(this.#session()));

  /**
   * Bind the store to a scope/flow and rehydrate from storage. Idempotent for the
   * same scope. Wires the cross-tab `storage` listener.
   */
  init(config: SessionStoreConfig): void {
    const previous = this.#config();
    if (previous && previous.scope === config.scope && previous.flow === config.flow) {
      return;
    }
    this.detachStorageListener();
    this.#config.set(config);
    this.#liveConflict.set(false);
    this.rehydrate();
    this.attachStorageListener();
  }

  /** Provide the API reconciliation hook (optional). */
  setReconciler(reconciler: SessionReconciler | null): void {
    this.#reconciler = reconciler;
  }

  /**
   * Defensive read — NewShore's `getValidSessionData`. Returns the current
   * session if valid and live; otherwise a clean session bound to the current
   * scope/flow. Never returns a half-cleared or expired tree.
   */
  getValidSession(): SessionData {
    const current = this.#session();
    if (this.isUsable(current) && !this.isExpired(current)) {
      return current;
    }
    return this.freshSession();
  }

  /** Replace the entire session tree (used by reconciliation). */
  setSession(next: SessionData): void {
    const normalised = this.isUsable(next) ? next : this.freshSession();
    this.commit(normalised);
  }

  /**
   * Add a line to the cart. **Idempotent by `item.id`**: re-adding the same id
   * replaces (does not duplicate) the line — the canonical idempotent case.
   */
  addItem(item: SessionItem): void {
    const base = this.ensureLive();
    const items = base.items.some((existing) => existing.id === item.id)
      ? base.items.map((existing) => (existing.id === item.id ? item : existing))
      : [...base.items, item];
    this.commit(this.touch({ ...base, items, status: 'building' }));
  }

  /** Remove a line by id. No-op if absent. */
  removeItem(itemId: string): void {
    const base = this.#session();
    if (!base.items.some((item) => item.id === itemId)) {
      return;
    }
    const items = base.items.filter((item) => item.id !== itemId);
    this.commit(this.touch({ ...base, items, status: items.length > 0 ? 'building' : 'empty' }));
  }

  /** Filter the cart to a single line kind — used by selective views/tests. */
  itemsOfKind(kind: string): readonly SessionItem[] {
    return this.#session().items.filter((item) => item.kind === kind);
  }

  /** Replace aggregate pricing (after a server price/availability call). */
  setPricing(pricing: Pricing): void {
    const base = this.#session();
    this.commit(this.touch({ ...base, pricing }));
  }

  /** Patch the lifecycle status. */
  setStatus(status: SessionData['status']): void {
    this.commit(this.touch({ ...this.#session(), status }));
  }

  /** Reset to a clean, live session for the current scope (NewShore CLEAN_*). */
  reset(): void {
    this.commit(this.freshSession());
  }

  /** Clear persistence and the in-memory tree. */
  clear(): void {
    this.#session.set(CLEAN_SESSION_DATA);
    const key = this.storageKey();
    if (key) {
      this.withStorage((storage) => storage.removeItem(key));
    }
  }

  /**
   * Reconcile the local session against the server via the configured hook.
   * Returns the reconciled session; on failure keeps the local copy (optimistic).
   */
  async reconcile(): Promise<SessionData> {
    if (this.#reconciler === null) {
      return this.#session();
    }
    try {
      const server = await this.#reconciler(this.#session());
      this.setSession(server);
      return this.#session();
    } catch (error) {
      this.#logger.warn('Session reconciliation failed; keeping local copy.', error);
      return this.#session();
    }
  }

  // ─── Internal: lifecycle helpers ───────────────────────────────────────────

  private ensureLive(): SessionData {
    const current = this.#session();
    return this.isUsable(current) && !this.isExpired(current) ? current : this.freshSession();
  }

  private freshSession(): SessionData {
    const config = this.#config();
    const now = Date.now();
    const ttl = config?.ttlMs ?? DEFAULT_TTL_MS;
    return {
      ...CLEAN_SESSION_DATA,
      sessionId: newId('sess'),
      flow: config?.flow ?? '',
      pricing: { ...CLEAN_SESSION_DATA.pricing, currency: config?.currency ?? 'COP' },
      createdAt: now,
      updatedAt: now,
      expiresAt: now + ttl,
      tabId: this.tabId,
    };
  }

  private touch(session: SessionData): SessionData {
    return { ...session, updatedAt: Date.now(), tabId: this.tabId };
  }

  private isUsable(session: unknown): session is SessionData {
    return (
      isRecord(session) &&
      typeof session['sessionId'] === 'string' &&
      session['sessionId'] !== '' &&
      Array.isArray(session['items'])
    );
  }

  private isExpired(session: SessionData): boolean {
    return session.expiresAt > 0 && Date.now() > session.expiresAt;
  }

  private commit(session: SessionData): void {
    this.#session.set(session);
    this.persist(session);
  }

  // ─── Internal: persistence + multi-tab ─────────────────────────────────────

  private storageKey(): string | null {
    const scope = this.#config()?.scope;
    return scope ? `${KEY_PREFIX}.${scope}` : null;
  }

  private persist(session: SessionData): void {
    const key = this.storageKey();
    if (!key) {
      return;
    }
    this.withStorage((storage) => {
      try {
        storage.setItem(key, JSON.stringify(session));
      } catch {
        // Quota / private mode — persistence is best-effort.
      }
    });
  }

  private rehydrate(): void {
    const key = this.storageKey();
    if (!key) {
      this.#session.set(CLEAN_SESSION_DATA);
      return;
    }
    const raw = this.withStorage((storage) => storage.getItem(key)) ?? null;
    const parsed = this.parse(raw);
    if (parsed && this.isUsable(parsed) && !this.isExpired(parsed)) {
      this.#session.set(parsed);
    } else {
      this.#session.set(this.freshSession());
    }
  }

  private parse(raw: string | null): SessionData | null {
    if (!raw) {
      return null;
    }
    try {
      const value: unknown = JSON.parse(raw);
      return this.isUsable(value) ? value : null;
    } catch {
      return null;
    }
  }

  private attachStorageListener(): void {
    if (typeof window === 'undefined' || this.#storageListener !== null) {
      return;
    }
    const key = this.storageKey();
    if (!key) {
      return;
    }
    this.#storageListener = (event: StorageEvent) => {
      if (event.key !== key || event.newValue === null) {
        return;
      }
      const incoming = this.parse(event.newValue);
      if (!incoming) {
        return;
      }
      // Another tab wrote a session it owns → live-session conflict for us.
      if (incoming.tabId && incoming.tabId !== this.tabId) {
        this.#liveConflict.set(true);
      }
      // Adopt the incoming tree so both tabs converge (optimistic merge by write).
      if (this.isUsable(incoming) && !this.isExpired(incoming)) {
        this.#session.set(incoming);
      }
    };
    window.addEventListener('storage', this.#storageListener);
  }

  private detachStorageListener(): void {
    if (typeof window !== 'undefined' && this.#storageListener !== null) {
      window.removeEventListener('storage', this.#storageListener);
    }
    this.#storageListener = null;
  }

  private withStorage<T>(action: (storage: Storage) => T): T | null {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }
      return action(localStorage);
    } catch {
      return null;
    }
  }
}
