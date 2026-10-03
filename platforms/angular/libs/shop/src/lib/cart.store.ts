/**
 * cart.store.ts
 *
 * Singleton Angular Signals store for the Synergos shop cart.
 * Shared by product-card, cart-item, cart-summary and any other shop component.
 *
 * Design principles:
 *  - State lives in Angular signals (zoneless-compatible)
 *  - El carrito del SERVIDOR manda (`/api/shop/cart`); localStorage es solo caché
 *  - Communicates via native CustomEvents so vanilla/React/Svelte components
 *    can also react without importing this file
 *
 * ⚠️ Este fichero decía "No HTTP here — only cart arithmetic", y esa premisa era
 * justamente el bug. Había DOS carritos: el del SSR (`syn-shop.js` → `POST
 * /api/shop/cart/add`, cookie de visitante, el que usan la página de carrito y el
 * checkout) y este, en `localStorage`. Montar un elemento Angular sobre una página
 * SSR hacía que "Añadir al carrito" abriera el mini-drawer anunciando éxito
 * mientras el carrito real se quedaba vacío — la familia de fallo del ADR 0112:
 * la UI anuncia algo que no ocurrió.
 *
 * Ahora toda mutación viaja al servidor y se ADOPTA su respuesta como estado. Se
 * actualiza local primero (optimista, para que la UI responda), y si el servidor
 * falla se REVIERTE y se avisa — nunca se deja la pantalla afirmando un éxito que
 * no pasó. El drawer solo se abre cuando el servidor confirmó.
 *
 * Sigue sin inyector a propósito (`fetch`, no `HttpClient`): es un singleton de
 * módulo, y un `effect()`/DI aquí ya rompió el arranque una vez (ver `persist`).
 *
 * **Uno por página, aunque se empaquete N veces** (UI#85). `shop` va dentro de cada elemento
 * (`BUNDLED_SYNERGOS`), así que cada bundle trae SU copia de este módulo, y un store de módulo
 * daba un carrito por bundle: con `product-detail` + `cart-summary` en la misma página, un clic
 * en «agregar» lo escuchaban los dos —dos `POST /cart/add`, la cantidad sumada dos veces— y cada
 * contador pintaba el suyo. Ahora el PRIMER bundle que carga crea el store en
 * `globalThis[Symbol.for('synergos.cart.v1')]` y los demás se enganchan a esa misma instancia:
 * un estado, un `hydrate()` y un solo listener de `sg:product:addToCart`. Los efectos (cargar y
 * escuchar) viven detrás del registro, no en el import. La versión va en el nombre del símbolo:
 * si el contrato del store cambia, sube a `v2` y los dos conviven sin pisarse. Las señales son
 * compatibles entre bundles porque `@angular/core` es del runtime compartido (`EXTERNALS`).
 *
 * Usage:
 *   import { cartStore } from '../cart.store';
 *   const count = cartStore.count;        // Signal<number>
 *   await cartStore.add({ productId, ... });   // Promise<boolean>
 */

import { computed, signal } from '@angular/core';
import type { CartItem, Cart } from '@synergos/contracts';
import { documentLiveAnnouncer } from '@synergos/shared';

// ── Constants ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'synergos-cart';
const CART_API = '/api/shop/cart';

// ── Server contract (Cart/CartLine de Synergos.CMS.Interfaces) ────────────────

interface ServerCartLine {
  readonly sku: string;
  readonly variantSku: string | null;
  readonly quantity: number;
  readonly productName: string;
  readonly unitPrice: number;
  readonly lineTotal: number;
  readonly imageUrl: string | null;
  readonly productUrl: string | null;
}

interface ServerCart {
  readonly lines: readonly ServerCartLine[];
  readonly subtotal: number;
  readonly currency: string;
  readonly itemCount: number;
}

/**
 * Traduce el carrito del servidor al contrato `CartItem` de la UI.
 *
 * `productId` = `sku`: el catálogo identifica por SKU (los ids de `/api/shop/search`
 * son códigos tipo "AUDIF-DIADEMA-001") y `CartLine` no expone otro identificador.
 * La moneda va a nivel de carrito en el servidor y por ítem en la UI.
 */
function toItems(cart: ServerCart): CartItem[] {
  return cart.lines.map((l) => ({
    productId: l.sku,
    variantId: l.variantSku ?? undefined,
    sku: l.sku,
    name: l.productName,
    image: l.imageUrl ?? undefined,
    price: l.unitPrice,
    // La moneda es la que manda el servidor con el carrito; sin ella, vacía (el precio se pinta
    // como número solo), nunca un peso inventado en el bundle (CMS#196).
    currency: cart.currency ?? '',
    quantity: l.quantity,
    subtotal: l.lineTotal,
  }));
}

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

// ── La fábrica: un carrito ───────────────────────────────────────────────────

/**
 * Crea UN carrito: su estado, sus mutaciones y sus efectos. Sólo la llama el registro de la
 * página (`carritoDeLaPagina`); dos llamadas serían dos carritos, que es el defecto de UI#85.
 */
function crearCarrito() {
  // ── State ─────────────────────────────────────────────────────────────────────

  const _items   = signal<CartItem[]>(loadItems());
  const _open    = signal(false);
  const _loading = signal(false);
  const _coupon  = signal<string | undefined>(undefined);
  const _discount = signal<number>(0);   // absolute discount amount
  /** Último fallo de sincronización con el servidor. `undefined` = todo confirmado. */
  const _lastError = signal<string | undefined>(undefined);

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
    currency:  _items()[0]?.currency ?? '',
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

  // ── Transporte al carrito de servidor ─────────────────────────────────────────

  /**
   * Llama al carrito de servidor y devuelve el carrito resultante, o `null` si no se
   * pudo confirmar (red caída, 4xx/5xx, JSON ilegible).
   *
   * `credentials: 'same-origin'` es lo que hace que viaje la cookie del visitante:
   * sin ella el servidor abriría un carrito nuevo en cada llamada y el SSR y el
   * elemento seguirían viendo cosas distintas.
   */
  async function callCart(path: string, body?: unknown): Promise<ServerCart | null> {
    if (typeof fetch === 'undefined') return null;
    try {
      const res = await fetch(`${CART_API}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) return null;
      return (await res.json()) as ServerCart;
    } catch {
      return null;
    }
  }

  /** Adopta el carrito del servidor como estado. Es la ÚNICA vía que fija `_items`. */
  function adopt(cart: ServerCart): void {
    _items.set(toItems(cart));
    persist();
  }

  /**
   * Ejecuta una mutación optimista y la confirma contra el servidor.
   *
   * Si el servidor no confirma, REVIERTE al estado previo y emite `sg:cart:error`.
   * Devuelve si la operación quedó realmente registrada — quien abra un drawer o
   * anuncie éxito debe mirar este booleano, no asumirlo.
   */
  async function commit(optimistic: () => void, path: string, body?: unknown): Promise<boolean> {
    const previous = _items();
    optimistic();
    persist();

    _loading.set(true);
    const cart = await callCart(path, body);
    _loading.set(false);

    if (!cart) {
      _items.set(previous);          // revertir: la pantalla no puede quedar mintiendo
      persist();
      _lastError.set('No se pudo actualizar el carrito.');
      window.dispatchEvent(new CustomEvent('sg:cart:error', { bubbles: false, composed: true }));
      return false;
    }

    _lastError.set(undefined);
    adopt(cart);
    return true;
  }

  /** Trae el carrito del servidor y lo adopta. Es lo que reconcilia con el SSR. */
  async function hydrate(): Promise<boolean> {
    const cart = await callCart('');
    if (!cart) return false;
    adopt(cart);
    return true;
  }

  // ── Mutations ─────────────────────────────────────────────────────────────────

  async function add(item: Omit<CartItem, 'subtotal'>): Promise<boolean> {
    return commit(
      () => _items.update((prev) => {
        const key = itemKey(item.productId, item.variantId);
        const idx = prev.findIndex((i) => itemKey(i.productId, i.variantId) === key);
        if (idx >= 0) {
          return prev.map((i, n) =>
            n === idx
              ? { ...i, quantity: i.quantity + item.quantity, subtotal: (i.quantity + item.quantity) * i.price }
              : i,
          );
        }
        return [...prev, { ...item, subtotal: item.price * item.quantity }];
      }),
      '/add',
      // El servidor indexa por SKU, no por productId.
      { sku: item.sku, quantity: item.quantity, variantSku: item.variantId ?? null },
    );
  }

  async function remove(productId: string, variantId?: string): Promise<boolean> {
    const key = itemKey(productId, variantId);
    const target = _items().find((i) => itemKey(i.productId, i.variantId) === key);
    if (!target) return true;   // ya no está: nada que pedirle al servidor

    return commit(
      () => _items.update((prev) => prev.filter((i) => itemKey(i.productId, i.variantId) !== key)),
      '/remove',
      { sku: target.sku, variantSku: target.variantId ?? null },
    );
  }

  async function updateQuantity(productId: string, quantity: number, variantId?: string): Promise<boolean> {
    if (quantity <= 0) return remove(productId, variantId);

    const key = itemKey(productId, variantId);
    const target = _items().find((i) => itemKey(i.productId, i.variantId) === key);
    if (!target) return false;

    return commit(
      () => _items.update((prev) =>
        prev.map((i) =>
          itemKey(i.productId, i.variantId) === key
            ? { ...i, quantity, subtotal: i.price * quantity }
            : i,
        ),
      ),
      '/update',
      { sku: target.sku, quantity, variantSku: target.variantId ?? null },
    );
  }

  async function clear(): Promise<boolean> {
    const ok = await commit(() => _items.set([]), '/clear');
    if (ok) {
      _coupon.set(undefined);
      _discount.set(0);
      persist();
    }
    return ok;
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

  /**
   * Los efectos del store —reconciliar con el servidor y escuchar «agregar»—. Los corre el registro
   * UNA vez, al crear el store de la página; nunca el import de un bundle (UI#85).
   */
  function arrancar(): void {
    if (typeof window === 'undefined') return;
    // Reconciliar con el carrito de servidor al cargar. localStorage ya pintó algo
    // para el primer frame; esto lo corrige con la verdad (y recoge lo que el
    // usuario hubiera añadido desde una página SSR con `syn-shop.js`).
    void hydrate();

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
      void add({
        productId: d.productId,
        variantId: d.variantId,
        sku:       d.productSku,
        name:      d.name,
        price:     d.price,
        currency:  d.currency,
        image:     d.image,
        quantity:  d.quantity ?? 1,
      }).then((ok) => {
        // El drawer se abre SOLO si el servidor confirmó. Abrirlo siempre era
        // exactamente el fallo: anunciar al comprador que el producto está en su
        // carrito cuando el carrito real no lo tiene.
        //
        // Y lo que se VE se OYE (#82): hasta acá, agregar no le decía nada a un lector
        // de pantalla — ni el éxito ni el fallo, que revertía el carrito en silencio.
        // Se anuncia AQUÍ porque es el único sitio que sabe las dos cosas: si el
        // servidor confirmó y qué producto era. El store no tiene inyector (ver la
        // cabecera), así que usa el anunciador del documento, que es la misma región
        // que la de `LiveAnnouncerService`. Con el cajón abierto (`aria-modal`), el
        // anunciador se cuelga de él para que el mensaje no quede fuera del modal.
        const anunciador = documentLiveAnnouncer(document);
        if (ok) {
          openDrawer();
          anunciador.announce(`${d.name} agregado al carrito.`);
        } else {
          anunciador.announce(`No se pudo agregar ${d.name} al carrito.`, 'assertive');
        }
      });
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  const api = {
    // State (readonly signals)
    items:    _items.asReadonly(),
    open:     _open.asReadonly(),
    loading:  _loading.asReadonly(),
    coupon:   _coupon.asReadonly(),
    /** Último fallo al sincronizar con el servidor; `undefined` si todo está confirmado. */
    lastError: _lastError.asReadonly(),

    // Computed
    count,
    subtotal,
    total,
    isEmpty,
    snapshot,

    // Mutations — async: devuelven si el SERVIDOR confirmó
    add,
    remove,
    updateQuantity,
    clear,

    /** Reconcilia con el carrito de servidor. Se llama sola al cargar. */
    hydrate,

    // Drawer
    openDrawer,
    closeDrawer,
    toggleDrawer,

    // Discounts
    applyDiscount,
    clearDiscount,
  } as const;

  return { api, arrancar };
}

/** El store del carrito: su forma es el contrato `v1` que comparten los bundles de la página. */
export type CartStore = ReturnType<typeof crearCarrito>['api'];

// ── El registro de la página (UI#85) ─────────────────────────────────────────

/**
 * La clave del store en la página. `Symbol.for` es el registro GLOBAL de símbolos: el mismo
 * símbolo para todas las copias de este módulo, que es lo que las hace encontrarse. La versión
 * del contrato va en el nombre.
 */
export const CLAVE_DEL_CARRITO = Symbol.for('synergos.cart.v1');

/**
 * El carrito de la página: el que creó el primer bundle que cargó, o uno nuevo si éste es el
 * primero —y entonces, y sólo entonces, arrancan sus efectos—.
 */
export function carritoDeLaPagina(): CartStore {
  const registro = globalThis as unknown as Record<symbol, CartStore | undefined>;
  const existente = registro[CLAVE_DEL_CARRITO];
  if (existente) {
    return existente;
  }
  const { api: nuevo, arrancar: arrancarNuevo } = crearCarrito();
  registro[CLAVE_DEL_CARRITO] = nuevo;
  arrancarNuevo();
  return nuevo;
}

export const cartStore: CartStore = carritoDeLaPagina();
