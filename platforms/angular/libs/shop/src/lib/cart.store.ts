/**
 * cart.store.ts
 *
 * Singleton Angular Signals store for the Synergos shop cart.
 * Shared by product-card, cart-item, cart-summary and any other shop component.
 *
 * Design principles:
 *  - State lives in Angular signals (zoneless-compatible)
 *  - Persisted automatically to localStorage on every mutation
 *  - Communicates via native CustomEvents so vanilla/React/Svelte components
 *    can also react without importing this file
 *  - No HTTP here — only cart arithmetic. API calls belong in OrderService.
 *
 * Usage:
 *   import { cartStore } from '../cart.store';
 *   const count = cartStore.count;        // Signal<number>
 *   cartStore.add({ productId, ... });
 */

import { computed, signal } from '@angular/core';
import type { CartItem, Cart } from '@synergos/contracts';

// ── Constants ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'synergos-cart';
const DEFAULT_CURRENCY = 'COP';

// ── Persistence helpers ────────────────────────────────────────────────────────

function loadItems(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CartItem[];
  } catch {
    return [];
  }
}

function itemKey(productId: string, variantId?: string): string {
  return variantId ? `${productId}::${variantId}` : productId;
}

// ── State ─────────────────────────────────────────────────────────────────────

const _items   = signal<CartItem[]>(loadItems());
const _open    = signal(false);
const _loading = signal(false);
const _coupon  = signal<string | undefined>(undefined);
const _discount = signal<number>(0);   // absolute discount amount

// ── Computed ──────────────────────────────────────────────────────────────────

const count    = computed(() => _items().reduce((n, i) => n + i.quantity, 0));
const subtotal = computed(() => _items().reduce((n, i) => n + i.subtotal, 0));
const total    = computed(() => Math.max(0, subtotal() - _discount()));
const isEmpty  = computed(() => _items().length === 0);

const snapshot = computed<Cart>(() => ({
  items:     _items(),
  itemCount: count(),
  subtotal:  subtotal(),
  discount:  _discount() > 0 ? _discount() : undefined,
  total:     total(),
  currency:  _items()[0]?.currency ?? DEFAULT_CURRENCY,
  coupon:    _coupon(),
  updatedAt: new Date().toISOString(),
}));

// ── Persistence + event bus ───────────────────────────────────────────────────

/**
 * Persist to localStorage and notify non-Angular consumers.
 *
 * Called explicitly by every mutation that changes the snapshot (items, coupon,
 * discount). This used to be a module-level `effect()`, which threw NG0203 at
 * import time — `effect()` requires an injection context, and this store is a
 * plain module singleton with no injector. That exception escaped before
 * `createApplication()` ran, so the custom elements never registered and both
 * cart-item and cart-summary were dead on arrival in the browser.
 *
 * Drawer open/close deliberately does NOT persist: it is not part of the
 * snapshot, and the old effect did not track it either.
 */
function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_items()));
  } catch { /* storage quota exceeded — silently skip */ }

  window.dispatchEvent(
    new CustomEvent('sg:cart:updated', {
      bubbles:  false,
      composed: true,
      detail:   snapshot(),
    }),
  );
}

// ── Mutations ─────────────────────────────────────────────────────────────────

function add(item: Omit<CartItem, 'subtotal'>): void {
  _items.update((prev) => {
    const key = itemKey(item.productId, item.variantId);
    const idx  = prev.findIndex((i) => itemKey(i.productId, i.variantId) === key);

    if (idx >= 0) {
      // Increase quantity of existing item
      return prev.map((i, n) =>
        n === idx
          ? { ...i, quantity: i.quantity + item.quantity, subtotal: (i.quantity + item.quantity) * i.price }
          : i,
      );
    }

    // Add new item
    return [...prev, { ...item, subtotal: item.price * item.quantity }];
  });
  persist();
}

function remove(productId: string, variantId?: string): void {
  const key = itemKey(productId, variantId);
  _items.update((prev) => prev.filter((i) => itemKey(i.productId, i.variantId) !== key));
  persist();
}

function updateQuantity(productId: string, quantity: number, variantId?: string): void {
  if (quantity <= 0) { remove(productId, variantId); return; }
  const key = itemKey(productId, variantId);
  _items.update((prev) =>
    prev.map((i) =>
      itemKey(i.productId, i.variantId) === key
        ? { ...i, quantity, subtotal: i.price * quantity }
        : i,
    ),
  );
  persist();
}

function clear(): void {
  _items.set([]);
  _coupon.set(undefined);
  _discount.set(0);
  persist();
}

function openDrawer(): void  { _open.set(true);  }
function closeDrawer(): void { _open.set(false); }
function toggleDrawer(): void { _open.update((v) => !v); }

function applyDiscount(code: string, amount: number): void {
  _coupon.set(code);
  _discount.set(amount);
  persist();
}

function clearDiscount(): void {
  _coupon.set(undefined);
  _discount.set(0);
  persist();
}

// ── Listen for add-to-cart events (from product-card and other components) ────

if (typeof window !== 'undefined') {
  window.addEventListener('sg:product:addToCart', (e: Event) => {
    const ev = e as CustomEvent<{
      productId:  string;
      productSku: string;
      name:       string;
      price:      number;
      currency:   string;
      image?:     string;
      quantity:   number;
      variantId?: string;
    }>;
    const d = ev.detail;
    add({
      productId: d.productId,
      variantId: d.variantId,
      sku:       d.productSku,
      name:      d.name,
      price:     d.price,
      currency:  d.currency,
      image:     d.image,
      quantity:  d.quantity ?? 1,
    });
    openDrawer();   // open mini-cart on add
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export const cartStore = {
  // State (readonly signals)
  items:    _items.asReadonly(),
  open:     _open.asReadonly(),
  loading:  _loading.asReadonly(),
  coupon:   _coupon.asReadonly(),

  // Computed
  count,
  subtotal,
  total,
  isEmpty,
  snapshot,

  // Mutations
  add,
  remove,
  updateQuantity,
  clear,

  // Drawer
  openDrawer,
  closeDrawer,
  toggleDrawer,

  // Discounts
  applyDiscount,
  clearDiscount,
} as const;
