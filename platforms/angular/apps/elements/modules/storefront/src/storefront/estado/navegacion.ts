import { type DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  AvisosDeLaTienda,
  CarritoDeLaTienda,
  CatalogoDeLaTienda,
  CompraDeLaTienda,
  DeseosDeLaTienda,
  FLUJO_DE_LA_COMPRA,
  MensajesDeLaTienda,
  PedidosDeLaTienda,
  type ShopProduct,
} from '@synergos/dominio/tienda';
import {
  AVISOS_GENERADOS,
  baseDeRuta,
  mismaRuta,
  type RutaDeUnaVistaDelSitio,
  segmentosDeRuta,
} from '@synergos/vitals-core';
import { type AccountSectionId, type StorefrontView, vistaDelBloque } from '../rutas-de-la-tienda';
const ACCOUNT_SECTIONS: readonly AccountSectionId[] = [
  'compras',
  'favoritos',
  'mensajes',
  'perfil',
];

/**
 * Por dónde anda quien mira la tienda (014-despiece-tienda, T010): la vista, el cajón del carrito y la sección de
 * la cuenta, con el enrutado por hash (`#/<scope>/p/<id>`, `#/<scope>/cuenta/…`) que la deja enlazable.
 *
 * Desde I3, una vista que vive en OTRA página del sitio se abre yendo a esa página (`rutas`, que manda el CMS): un
 * enlace de verdad, con atrás y adelante del navegador. La que no tiene página propia se sigue abriendo aquí.
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

  /** Dónde vive cada vista en el sitio, y cuál es la de esta página: los del bloque, que conecta el elemento. */
  #rutas: () => readonly RutaDeUnaVistaDelSitio[] = () => [];
  #vistaDeLaPagina: () => StorefrontView = () => 'home';

  conectar(fuentes: {
    scope: () => string;
    rutas: () => readonly RutaDeUnaVistaDelSitio[];
    vista: () => StorefrontView;
  }): void {
    this.#scope = fuentes.scope;
    this.#rutas = fuentes.rutas;
    this.#vistaDeLaPagina = fuentes.vista;
  }

  /** Abre la vista que el editor eligió para esta página, antes de mirar el hash, que la puede cambiar. */
  abrirLaVistaDeLaPagina(): void {
    const vista = this.#vistaDeLaPagina();
    if (vista !== 'home') {
      this.applyRoute(vista === 'checkout' && !this.#carrito.hasCart() ? 'cart' : vista, '');
    }
  }

  /**
   * La URL de la página donde vive `view`, con lo que la vista necesita (el producto, la sección de la cuenta, la
   * compra de la confirmación); vacía si la vista se abre en ESTA página: es la suya, o el sitio no le dio otra.
   * La confirmación sólo va a su página con la compra (`?compra=`), que es como esa página la abre.
   */
  urlDe(view: StorefrontView, param = ''): string {
    if (view === this.#vistaDeLaPagina() || (view === 'confirmation' && !param)) {
      return '';
    }
    const url = this.#rutas().find((ruta) => ruta.vista === vistaDelBloque(view))?.url;
    if (!url) {
      return '';
    }
    if (view === 'confirmation') {
      // El parámetro del enlace del aviso (`?compra=`): lo genera N3, y es el que esa página lee.
      return `${url}?${AVISOS_GENERADOS[FLUJO_DE_LA_COMPRA].parametro}=${encodeURIComponent(param)}`;
    }
    return view === 'pdp' || view === 'account' ? `${url}${this.routeHash(view, param)}` : url;
  }

  /**
   * Lo que hace pulsar un enlace de la tienda: si lleva `href` (la vista vive en otra página), el navegador ya va
   * ahí y no hay nada más que hacer; si no, abre la vista aquí.
   */
  alPulsar(view: StorefrontView, param = ''): void {
    if (!this.urlDe(view, param)) {
      this.navigate(view, param);
    }
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
    const pagina = typeof window === 'undefined' ? '' : this.urlDe(view, param);
    if (pagina) {
      window.location.assign(pagina);
      return;
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
