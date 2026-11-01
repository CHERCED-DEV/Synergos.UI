import { ElementRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  FulfillmentContext,
  SessionStore,
  TransactionEventBusService,
  type SessionItem,
} from '@synergos/transaction-engine';
import { aMenores, desdeMenores, formatearImporte } from '@synergos/vitals-core';
import { CatalogoDeLaTienda } from '../catalogo/catalogo';
import type { ProductVariant, ShopProduct } from '../catalogo/catalogo.model';
import { ConfiguracionDeLaTienda } from '../comun/configuracion';
import { TEXTOS_DE_LA_TIENDA } from '../comun/textos';
import { varianteSintetica } from '../compra/compra.model';
import {
  CODIGO_DEMASIADOS_CODIGOS,
  PREFIJO_DEL_CUPON,
  caminoDeLaCompraEnCurso,
  caminoDeLaPendiente,
  compraPendiente,
  type ShopSelectionPayload,
} from '../compra/shop-fulfillment.strategy';
import { cotizarCompraDeTienda, cuerpoDeLaCompra } from '../compra/tienda-compra';
import { CuponApi } from './cupon-api.client';
import type { BusDeLaTienda, MotivoDelCupon, ShopPromo } from './carrito.model';

/**
 * La variante de un producto que no trae ninguna: él mismo, con la etiqueta que le pone la app («Estándar»). La usan el agregado rápido del catálogo y la
 * ficha (004-tienda-compra, etapa 3): los productos del CMS llegan con `variants: []`, y la ficha no agregaba nada.
 */
export function varianteEstandar(product: ShopProduct, etiqueta: string): ProductVariant {
  return {
    variantId: varianteSintetica(product.id),
    label: etiqueta,
    attributes: {},
    amount: product.amount,
    inStock: true,
    stock: 99,
  };
}

/** El motivo del control del cupón por el `code` con que `cotizar` lo rechazó. */
function motivoDelCupon(code: string): MotivoDelCupon {
  switch (code) {
    case 'pricing.promotion_not_found':
      return 'unknown';
    case 'pricing.promotion_expired':
      return 'expired';
    case 'pricing.promotion_currency_mismatch':
      return 'not-applicable';
    case CODIGO_DEMASIADOS_CODIGOS:
      return 'too-many-attempts';
    default:
      return 'failed';
  }
}

/**
 * Lo que sólo la pantalla que monta el carrito puede hacer, en el punto del flujo en que lo hacía (014-despiece-tienda,
 * T008): emitir el evento del elemento, abrir el cajón, anunciar y vaciar el control del cupón.
 */
export interface ConexionDelCarrito {
  /** El carrito cambió: el elemento lo emite (`cartchange`). */
  alCambiar(count: number): void;
  /** Se agregó algo: se abre el cajón. */
  abrir(): void;
  /** Lo que se oye por la región viva del documento. */
  anunciar(texto: string, cortesia?: 'polite' | 'assertive'): void;
  /** El cupón quedó aplicado: el control se vacía. */
  limpiarCupon(): void;
}

/**
 * El carrito de una tienda sobre el motor de transacciones (014-despiece-tienda, T008): sus líneas, lo que lo deja
 * fijo mientras una compra por la puerta pueda cobrar, el cupón y el precio que se recalcula con cada cambio.
 */
@Injectable()
export class CarritoDeLaTienda {
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);
  readonly #bus = inject<TransactionEventBusService<BusDeLaTienda>>(TransactionEventBusService);
  readonly #api = inject(CuponApi);
  readonly #config = inject(ConfiguracionDeLaTienda);
  readonly #catalogo = inject(CatalogoDeLaTienda);
  readonly #textos = inject(TEXTOS_DE_LA_TIENDA);
  /** El `<synergos-storefront>` de ESTA compra: desde él se encuentra, por ancestro, su `<synergos-flujo>`. */
  readonly #host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  #conexion: ConexionDelCarrito | null = null;

  /** La pantalla se conecta al construirse; sin conectar, el carrito funciona y nadie se entera. */
  conectar(conexion: ConexionDelCarrito): void {
    this.#conexion = conexion;
  }

  // ─── Cart (engine) ──────────────────────────────────────────────────────────
  readonly cartItems = this.#store.items;
  readonly cartCount = computed(() =>
    this.#store.items().reduce((sum, item) => sum + item.quantity, 0),
  );
  readonly cartLineCount = this.#store.itemCount;
  readonly hasCart = this.#store.hasItems;
  readonly cartTotalMinor = computed(() => this.#store.pricing().totalAmount);

  /**
   * Si ESTA compra va por la puerta: la que ya salió, por el camino por el que salió (su saga sólo existe
   * de ese lado); sin ninguna en curso, la que declara el CMS. Nunca se cae de un camino al otro.
   */
  readonly porLaPuerta = computed(
    () => caminoDeLaCompraEnCurso(this.#store.session(), this.#config.purchasePath()) === 'puerta',
  );

  /** La compra por la puerta que esta sesión dejó sin terminar (abierta y sin cerrar), si la hay. */
  readonly compraSinTerminar = computed(() => {
    const sesion = this.#store.session();
    return caminoDeLaPendiente(sesion) === 'puerta' ? compraPendiente(sesion) : null;
  });

  /** Se intentó cambiar el carrito con una compra sin terminar: se pinta el aviso con sus dos salidas. */
  readonly avisoDePendiente = signal(false);

  /**
   * El carrito no cambia mientras una compra por la puerta pueda cobrar: lo que se abrió es lo que se
   * cierra, y otra llave sería otra saga que aparta y autoriza al lado. Elegir otra vez la resuelve primero.
   */
  carritoFijado(): boolean {
    if (this.compraSinTerminar() === null) {
      return false;
    }
    this.avisoDePendiente.set(true);
    return true;
  }

  // ─── Cart (engine wiring) ────────────────────────────────────────────────────
  /**
   * Agrega lo que muestra la ficha. **Un producto sin variantes se agrega como tal** (004-tienda-compra, etapa 3): los
   * del CMS llegan con `variants: []`, `selectedVariant` quedaba en `null` y el botón volvía en silencio. Lo único que
   * frena aquí es no tener existencias, y entonces el botón está deshabilitado y la ficha dice «Sin stock».
   */
  addCurrentToCart(): void {
    const detail = this.#catalogo.detail();
    if (!detail || !this.#catalogo.pdpInStock()) {
      return;
    }
    this.addToCart(detail.product, this.#catalogo.selectedVariant() ?? varianteEstandar(detail.product, this.#textos.varianteEstandar), this.#catalogo.pdpQuantity());
  }

  quickAdd(product: ShopProduct): void {
    if (!product.inStock) {
      return;
    }
    // El agregado rápido del catálogo no elige variante: la del producto mismo.
    this.addToCart(product, varianteEstandar(product, this.#textos.varianteEstandar), 1);
  }

  /**
   * El producto cuyo último «agregar» FALLÓ, para que se VEA junto al botón que se pulsó
   * (#87). Desde el #82 el fallo se oía —el anunciador, asertivo— y no se veía nada: quien
   * mira la pantalla pulsaba, el cajón no se abría y no había ningún porqué. No es una
   * región viva: el anuncio ya lo hace el anunciador, y una segunda región lo diría dos veces.
   */
  readonly addFailedId = signal<string | null>(null);

  private addToCart(product: ShopProduct, variant: ProductVariant, quantity: number): void {
    this.addFailedId.set(null);
    if (this.carritoFijado()) {
      return;
    }
    const session = this.#store.getValidSession();
    const payload: ShopSelectionPayload = {
      productId: product.id,
      variantId: variant.variantId,
      variantLabel: variant.label,
      title: product.title,
      unitAmount: variant.amount,
      currency: product.currency || this.#catalogo.currency(),
      quantity,
      image: product.images[0] ?? '',
      seller: product.seller,
      // La base viaja en la línea para que `confirm` no tenga que adivinarla (#116).
      apiBase: this.#config.apiBase(),
    };
    void this.#fulfillment
      .select(
        {
          productRef: product.id,
          kind: 'product',
          label: product.title,
          amount: variant.amount,
          selection: payload as unknown as Readonly<Record<string, unknown>>,
        },
        session,
      )
      .then((selection) => {
        // Merge the delta qty against the live store line at apply time so
        // concurrent quick-adds accumulate (the engine's addItem is replace-by-id).
        const existing = this.#store.items().find((item) => item.id === selection.item.id);
        const merged = existing
          ? { ...selection.item, quantity: existing.quantity + selection.item.quantity }
          : selection.item;
        this.#store.addItem(merged);
        this.reprice();
        this.#conexion?.abrir();
        this.emitCartUpdate();
        // Abrir el cajón se VE; sin esto, agregar al carrito no se oía (#82).
        this.#conexion?.anunciar(this.#textos.agregadoAlCarrito(product.title));
      })
      .catch(() => {
        // Antes el `.then` no tenía `catch`: el fallo era un rechazo sin manejar, mudo para
        // todos. Desde el #82 se oye, y desde el #87 también se VE, junto al botón.
        this.#conexion?.anunciar(this.#textos.noSeAgregoAlCarrito(product.title), 'assertive');
        this.addFailedId.set(product.id);
      });
  }

  setLineQuantity(item: SessionItem, quantity: number): void {
    if (this.carritoFijado()) {
      return;
    }
    if (quantity < 1) {
      this.removeFromCart(item.id);
      return;
    }
    this.#store.addItem({ ...item, quantity });
    this.reprice();
    this.emitCartUpdate();
  }

  removeFromCart(itemId: string): void {
    if (this.carritoFijado()) {
      return;
    }
    this.#store.removeItem(itemId);
    this.reprice();
    this.emitCartUpdate();
  }

  // ─── Cupones: `syn-promo-code` (#29) ────────────────────────────────────────
  //
  // No había forma de dar un descuento. El motor lo soportaba desde el primer día
  // —`PriceLine.amount` dice «can be negative for discounts»— y ningún dominio
  // emitía una línea negativa; lo único que existía era `listPrice`, un precio
  // tachado que nadie podía obtener.
  readonly promo = signal<ShopPromo | null>(null);
  readonly promoBusy = signal(false);
  readonly promoRejection = signal<MotivoDelCupon | null>(null);
  readonly promoDetail = signal('');

  /**
   * Valida el cupón contra el servidor. **No lo da por aplicado sin confirmación**:
   * un descuento fingido acá es una promesa de plata que el checkout rompe.
   */
  async applyPromo(code: string): Promise<void> {
    if (this.promoBusy() || this.cuponFijado()) {
      return;
    }
    this.promoBusy.set(true);
    this.promoRejection.set(null);
    this.promoDetail.set('');

    if (this.porLaPuerta()) {
      await this.cotizarConCupon(code);
      this.promoBusy.set(false);
      return;
    }

    const subtotal = this.#store
      .items()
      .reduce((sum, item) => sum + item.amount * item.quantity, 0);
    const result = await this.#api.applyPromo(this.#config.apiBase(), code, subtotal);

    this.promoBusy.set(false);

    if (result.ok) {
      this.promo.set(result.promo);
      this.#conexion?.limpiarCupon();
      this.reprice();
      this.emitCartUpdate();
      return;
    }

    this.promoRejection.set(result.reason);
    if (result.reason === 'minimum-not-met' && result.shortfallMinor) {
      // CUÁNTO falta es lo único accionable de este rechazo.
      this.promoDetail.set(this.#textos.faltaParaElCupon(this.formatMinor(result.shortfallMinor)));
    }
  }

  /**
   * Por la puerta, el cupón lo calcula el SERVIDOR (US 8): `cotizar` corre la fase que abre hasta antes de
   * apartar, con el código, y del navegador sólo viaja el código. Lo que se muestra es lo que abrir
   * autorizaría; un código que no existe, vencido, o con demasiados intentos se dice por su motivo.
   */
  private async cotizarConCupon(code: string): Promise<void> {
    const codigo = code.trim().toUpperCase();
    const r = await cotizarCompraDeTienda(this.#host, cuerpoDeLaCompra(this.#store.getValidSession(), codigo));
    if (!r.ok) {
      this.promoRejection.set(motivoDelCupon(r.rechazo.code));
      return;
    }
    const descuento = r.valor.descuento;
    if (!descuento || descuento.amount <= 0) {
      this.promoRejection.set('not-applicable');
      return;
    }
    this.promo.set({ code: codigo, amountMinor: -aMenores(descuento.amount, descuento.currency), label: codigo });
    this.#conexion?.limpiarCupon();
    this.reprice();
    this.emitCartUpdate();
  }

  /**
   * El cupón queda FIJO mientras una compra suya pueda cobrar: abrir con otro código sería otra intención,
   * otra saga que aparta y autoriza al lado de la primera.
   */
  readonly cuponFijado = computed(() => compraPendiente(this.#store.session()) !== null);

  /** Quita el cupón que dejó de valer al abrir: la compra no se apartó, y el carrito vuelve a su total. */
  quitarElCupon(): void {
    this.promo.set(null);
    this.reprice();
    this.emitCartUpdate();
  }

  /** Quita el cupón y devuelve el total anterior. */
  removePromo(): void {
    if (this.cuponFijado()) {
      return;
    }
    this.promo.set(null);
    this.promoRejection.set(null);
    this.promoDetail.set('');
    this.reprice();
    this.emitCartUpdate();
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  /** Recompute aggregate pricing from the cart lines (single source of truth). */
  reprice(): void {
    const items = this.#store.items();
    const subtotal = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
    const promo = this.promo();
    const lineas = items.map((item) => ({
      code: `line:${item.id}`,
      label: item.label,
      amount: item.amount * item.quantity,
    }));
    if (promo) {
      // La línea NEGATIVA que el motor esperaba desde el primer día.
      lineas.push({ code: `${PREFIJO_DEL_CUPON}${promo.code}`, label: promo.label, amount: promo.amountMinor });
    }
    // El descuento nunca deja el total bajo cero: un carrito que se debe a sí
    // mismo no es un carrito, y el checkout lo cobraría como un importe negativo.
    const total = Math.max(0, subtotal + (promo?.amountMinor ?? 0));
    this.#store.setPricing({
      currency: this.#catalogo.currency(),
      totalAmount: total,
      balanceDue: total,
      breakdown: lineas,
    });
  }

  emitCartUpdate(): void {
    const count = this.cartCount();
    this.#conexion?.alCambiar(count);
    this.#bus.publish('cartUpdated', { count, total: this.cartTotalMinor() });
  }

  /** Un importe con su moneda; sin moneda (todavía no llegó ningún precio) se pinta el número solo. */
  formatPrice(amount: number, currency: string): string {
    return formatearImporte(amount, currency);
  }

  /** Un importe del carrito, en unidades menores de su moneda (la de la sesión o la del catálogo). */
  formatMinor(minor: number): string {
    const moneda = this.#store.pricing().currency || this.#catalogo.currency();
    return this.formatPrice(desdeMenores(minor, moneda), moneda);
  }
}
