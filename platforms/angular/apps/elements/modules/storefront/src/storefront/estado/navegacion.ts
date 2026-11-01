import { type DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  AvisosDeLaTienda,
  CarritoDeLaTienda,
  CatalogoDeLaTienda,
  CompraDeLaTienda,
  DeseosDeLaTienda,
  MensajesDeLaTienda,
  PedidosDeLaTienda,
  type ShopProduct,
} from '@synergos/dominio/tienda';
import { baseDeRuta, mismaRuta, segmentosDeRuta } from '@synergos/vitals-core';
import { type AccountSectionId, type StorefrontView } from '../rutas-de-la-tienda';
const ACCOUNT_SECTIONS: readonly AccountSectionId[] = [
  'compras',
  'favoritos',
  'mensajes',
  'perfil',
];

/**
 * Por dónde anda quien mira la tienda (014-despiece-tienda, T010): la vista, el cajón del carrito y la sección de
 * la cuenta, con el enrutado por hash (`#/<scope>/p/<id>`, `#/<scope>/cuenta/…`) que la deja enlazable.
 */
@Injectable()
export class NavegacionDeLaTienda {
  readonly #avisos = inject(AvisosDeLaTienda);
  readonly #carrito = inject(CarritoDeLaTienda);
  readonly #catalogo = inject(CatalogoDeLaTienda);
  readonly #compra = inject(CompraDeLaTienda);
  readonly #deseos = inject(DeseosDeLaTienda);
  readonly #mensajes = inject(MensajesDeLaTienda);
  readonly #pedidos = inject(PedidosDeLaTienda);

  /** El prefijo de las rutas de ESTA tienda en el hash; lo conecta el elemento desde su entrada `scope`. */
  #scope: () => string = () => 'storefront';

  conectar(scope: () => string): void {
    this.#scope = scope;
  }

  /** Escucha el hash del navegador mientras viva la tienda: atrás y adelante mueven la vista. */
  escucharElHash(destroyRef: DestroyRef): void {
    if (typeof window === 'undefined') {
      return;
    }
    const onHashChange = (): void => this.applyHash();
    window.addEventListener('hashchange', onHashChange);
    destroyRef.onDestroy(() => window.removeEventListener('hashchange', onHashChange));
  }

  // ─── Router (signals + hash deep-links) ─────────────────────────────────────
  readonly view = signal<StorefrontView>('home');

  readonly cartOpen = signal(false);

  #suppressedHash = '';

  // ─── Router ──────────────────────────────────────────────────────────────────
  navigate(view: StorefrontView, param = ''): void {
    if (view === 'checkout' && !this.#carrito.hasCart()) {
      view = 'cart';
    }
    this.applyRoute(view, param);
    this.writeHash(view, param);
  }

  goHome(): void {
    this.navigate('home');
  }

  goToPlp(): void {
    this.navigate('plp');
  }

  goToCart(): void {
    this.cartOpen.set(false);
    this.navigate('cart');
  }

  goToCheckout(): void {
    if (!this.#carrito.hasCart()) {
      return;
    }
    this.cartOpen.set(false);
    this.navigate('checkout');
  }

  goToAccount(section: AccountSectionId = 'compras'): void {
    this.navigate('account', section);
  }

  continueShopping(): void {
    this.navigate('plp');
  }

  applyRoute(view: StorefrontView, param: string): void {
    this.#avisos.errorMessage.set('');
    switch (view) {
      case 'pdp':
        if (param && param !== this.#catalogo.detail()?.product.id) {
          void this.#catalogo.loadProduct(param);
        }
        this.view.set('pdp');
        return;
      case 'account': {
        const section = (ACCOUNT_SECTIONS as readonly string[]).includes(param)
          ? (param as AccountSectionId)
          : 'compras';
        this.accountSection.set(section);
        this.view.set('account');
        this.loadAccountSection(section);
        return;
      }
      case 'confirmation':
        if (!this.#compra.orderNumber()) {
          this.view.set('home');
          return;
        }
        this.view.set('confirmation');
        return;
      default:
        this.view.set(view);
    }
  }

  routeHash(view: StorefrontView, param: string): string {
    const base = baseDeRuta(this.#scope());
    switch (view) {
      case 'home':
        return base;
      case 'pdp':
        return `${base}/p/${encodeURIComponent(param)}`;
      case 'account':
        return `${base}/cuenta${param ? `/${param}` : ''}`;
      case 'cart':
        return `${base}/carrito`;
      case 'confirmation':
        return `${base}/confirmacion`;
      default:
        return `${base}/${view}`;
    }
  }

  writeHash(view: StorefrontView, param: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = this.routeHash(view, param);
    if (!mismaRuta(window.location.hash, hash)) {
      this.#suppressedHash = hash;
      window.location.hash = hash;
    }
  }

  applyHash(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = window.location.hash;
    if (mismaRuta(hash, this.#suppressedHash)) {
      this.#suppressedHash = '';
      return;
    }
    const segments = segmentosDeRuta(hash, this.#scope());
    if (!segments) {
      return;
    }
    const [head = '', tail = ''] = segments;
    switch (head) {
      case '':
        this.applyRoute('home', '');
        return;
      case 'plp':
        this.applyRoute('plp', '');
        return;
      case 'p':
        this.applyRoute('pdp', tail);
        return;
      case 'carrito':
        this.applyRoute('cart', '');
        return;
      case 'checkout':
        this.applyRoute(this.#carrito.hasCart() ? 'checkout' : 'cart', '');
        return;
      case 'confirmacion':
        this.applyRoute('confirmation', '');
        return;
      case 'cuenta':
        this.applyRoute('account', tail);
        return;
      default:
        this.applyRoute('home', '');
    }
  }

  // ─── Account (SH-4 inputs) ──────────────────────────────────────────────────
  readonly accountSection = signal<AccountSectionId>('compras');

  loadAccountSection(section: AccountSectionId): void {
    if (section === 'compras' && !this.#pedidos.ordersLoaded()) {
      void this.loadOrders();
    } else if (section === 'favoritos') {
      this.#deseos.loadWishlist();
    } else if (section === 'mensajes') {
      this.#mensajes.loadThreads();
    }
  }

  // ─── Account (SH-4 wiring) ───────────────────────────────────────────────────
  onAccountSectionChange(sectionId: string): void {
    const section = (ACCOUNT_SECTIONS as readonly string[]).includes(sectionId)
      ? (sectionId as AccountSectionId)
      : 'compras';
    this.accountSection.set(section);
    this.writeHash('account', section);
    this.loadAccountSection(section);
  }

  // ─── PDP (SH-2 wiring) ───────────────────────────────────────────────────────
  openProduct(product: ShopProduct): void {
    this.navigate('pdp', product.id);
  }

  backToResults(): void {
    this.#catalogo.detail.set(null);
    this.navigate('plp');
  }

  toggleCart(): void {
    this.cartOpen.update((open) => !open);
  }

  readonly loadOrders = (): Promise<void> => this.#pedidos.loadOrders(this.#compra.customerEmail());
}
