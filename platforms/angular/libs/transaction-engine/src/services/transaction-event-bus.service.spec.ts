import { TestBed } from '@angular/core/testing';
import {
  TransactionEventBusService,
  type TransactionEventMap,
} from './transaction-event-bus.service';

interface DemoBus extends TransactionEventMap {
  cartUpdated: { count: number };
  pageRedirected: { url: string };
}

describe(TransactionEventBusService.name, () => {
  let bus: TransactionEventBusService<DemoBus>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TransactionEventBusService] });
    bus = TestBed.inject<TransactionEventBusService<DemoBus>>(TransactionEventBusService);
    bus.scope('site-a');
  });

  afterEach(() => bus.destroy());

  // ── empty ──────────────────────────────────────────────────────────────────
  it('has no last event before anything is published', () => {
    expect(bus.lastEvent()).toBeNull();
  });

  // ── happy ──────────────────────────────────────────────────────────────────
  it('delivers a typed payload to local listeners and records lastEvent', () => {
    const seen: number[] = [];
    bus.on('cartUpdated', (payload) => seen.push(payload.count));

    bus.publish('cartUpdated', { count: 3 });

    expect(seen).toEqual([3]);
    expect(bus.lastEvent()?.type).toBe('cartUpdated');
    expect(bus.lastEvent()?.source).toBe(bus.instanceId);
  });

  // ── filter (listeners only fire for their type) ──────────────────────────────
  it('only invokes listeners for the matching event type', () => {
    const cart: unknown[] = [];
    const redirect: unknown[] = [];
    bus.on('cartUpdated', (p) => cart.push(p));
    bus.on('pageRedirected', (p) => redirect.push(p));

    bus.publish('pageRedirected', { url: '/checkout' });

    expect(cart).toEqual([]);
    expect(redirect).toEqual([{ url: '/checkout' }]);
  });

  it('scopes the channel name by instance', () => {
    expect(bus.channelName).toBe('synergos-txn:site-a');
    bus.scope('site-b');
    expect(bus.channelName).toBe('synergos-txn:site-b');
  });

  // ── idempotent (unsubscribe) ─────────────────────────────────────────────────
  it('stops delivering after unsubscribe', () => {
    const seen: number[] = [];
    const off = bus.on('cartUpdated', (p) => seen.push(p.count));

    bus.publish('cartUpdated', { count: 1 });
    off();
    bus.publish('cartUpdated', { count: 2 });

    expect(seen).toEqual([1]);
  });
});
