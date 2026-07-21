import { TestBed } from '@angular/core/testing';
import type { SessionItem } from '../models/session-data';
import { SessionStore } from './session-store.service';

function item(id: string, kind = 'hotel', amount = 100): SessionItem {
  return {
    id,
    kind,
    productRef: `ref-${id}`,
    label: `Item ${id}`,
    selection: {},
    amount,
    quantity: 1,
  };
}

describe(SessionStore.name, () => {
  let store: SessionStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [SessionStore] });
    store = TestBed.inject(SessionStore);
    store.init({ scope: 'test-site', flow: 'booking' });
  });

  // ── empty ──────────────────────────────────────────────────────────────────
  it('starts empty but live for the configured scope', () => {
    expect(store.itemCount()).toBe(0);
    expect(store.hasItems()).toBe(false);
    expect(store.isLive()).toBe(true);
    expect(store.session().flow).toBe('booking');
  });

  it('getValidSession returns a clean live session when nothing is usable', () => {
    const valid = store.getValidSession();
    expect(valid.sessionId).not.toBe('');
    expect(valid.items).toEqual([]);
    expect(valid.status).toBe('empty');
  });

  // ── happy ──────────────────────────────────────────────────────────────────
  it('adds heterogeneous items into the unified cart', () => {
    store.addItem(item('a', 'flight'));
    store.addItem(item('b', 'hotel'));
    expect(store.itemCount()).toBe(2);
    expect(store.session().status).toBe('building');
  });

  it('persists to localStorage scoped by origin and rehydrates', () => {
    store.addItem(item('a'));
    const raw = localStorage.getItem('syn.txn.session.test-site');
    expect(raw).toBeTruthy();

    const reloaded = TestBed.inject(SessionStore);
    // Same singleton in this TestBed; force a fresh rehydrate via re-init on new scope then back.
    reloaded.init({ scope: 'other', flow: 'booking' });
    reloaded.init({ scope: 'test-site', flow: 'booking' });
    expect(reloaded.itemCount()).toBe(1);
  });

  // ── filter ───────────────────────────────────────────────────────────────────
  it('filters cart lines by kind', () => {
    store.addItem(item('a', 'flight'));
    store.addItem(item('b', 'hotel'));
    store.addItem(item('c', 'flight'));
    expect(store.itemsOfKind('flight').map((line) => line.id)).toEqual(['a', 'c']);
    expect(store.itemsOfKind('hotel')).toHaveLength(1);
  });

  // ── idempotent ───────────────────────────────────────────────────────────────
  it('re-adding the same id replaces the line, never duplicates', () => {
    store.addItem(item('a', 'hotel', 100));
    store.addItem(item('a', 'hotel', 250));
    expect(store.itemCount()).toBe(1);
    expect(store.items()[0].amount).toBe(250);
  });

  it('removeItem is a no-op for an absent id', () => {
    store.addItem(item('a'));
    store.removeItem('missing');
    expect(store.itemCount()).toBe(1);
  });

  // ── reconciliation hook ──────────────────────────────────────────────────────
  it('adopts the server session via the reconciler', async () => {
    store.addItem(item('a'));
    store.setReconciler(async (local) => ({
      ...local,
      items: [...local.items, item('server-line', 'car')],
    }));

    const reconciled = await store.reconcile();
    expect(reconciled.items.map((line) => line.id)).toContain('server-line');
  });

  it('keeps the local copy when reconciliation fails', async () => {
    store.addItem(item('a'));
    store.setReconciler(async () => {
      throw new Error('network');
    });
    const result = await store.reconcile();
    expect(result.items.map((line) => line.id)).toEqual(['a']);
  });

  // ── TTL / expiration ─────────────────────────────────────────────────────────
  it('treats a session past its TTL as not live and recovers clean', () => {
    store.init({ scope: 'ttl-site', flow: 'booking', ttlMs: -1 });
    store.addItem(item('a'));
    // ttl -1 means expiresAt is already in the past
    const valid = store.getValidSession();
    expect(valid.items).toEqual([]);
  });
});
