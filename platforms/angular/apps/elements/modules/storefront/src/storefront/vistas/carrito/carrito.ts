import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, input, viewChild } from '@angular/core';
import { CarritoDeLaTienda } from '@synergos/dominio/tienda';
import { type AppliedPromo, PromoCodeComponent, type PromoCodeConfig } from '@synergos/shared';
import {
  type CartAction,
  type CartGroup,
  type CartLine,
  type CartQuantityChange,
  CartShellComponent,
  type CartShellConfig,
  type CartSummaryRow,
} from '@synergos/shells';
import { type SessionItem, SessionStore } from '@synergos/transaction-engine';
import { t } from '@synergos/vitals-core';
import { NavegacionDeLaTienda } from '../../estado/navegacion';
import { PresentacionDeLaTienda } from '../../estado/presentacion';

/** One seller group of cart lines (carrito agrupado por vendedor). */
interface CartSellerGroup {
  readonly seller: string;
  readonly items: readonly SessionItem[];
  readonly totalMinor: number;
}

const DEFAULT_SELLER_GROUP = 'Synergos Market';

/** El carrito sobre SH-12, en página (con el cupón) o en el cajón: la MISMA pieza en dos densidades. */
@Component({
  selector: 'sg-tienda-carrito',
  standalone: true,
  imports: [CartShellComponent, PromoCodeComponent],
  templateUrl: './carrito.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
  // Embedded published custom elements (<synergos-rating-stars> …).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TiendaCarritoComponent {
  readonly #store = inject(SessionStore);
  protected readonly carrito = inject(CarritoDeLaTienda);
  protected readonly navegacion = inject(NavegacionDeLaTienda);
  protected readonly presentacion = inject(PresentacionDeLaTienda);

  /** En página (con el cupón y el resumen) o en el cajón. */
  readonly modo = input<'pagina' | 'cajon'>('pagina');

  /** Carrito agrupado por vendedor (marketplace multi-seller). */
  readonly cartGroups = computed<readonly CartSellerGroup[]>(() => {
    const groups = new Map<string, SessionItem[]>();
    for (const item of this.carrito.cartItems()) {
      const seller = this.presentacion.itemString(item.selection, 'seller') || DEFAULT_SELLER_GROUP;
      const bucket = groups.get(seller) ?? [];
      bucket.push(item);
      groups.set(seller, bucket);
    }
    return [...groups.entries()].map(([seller, items]) => ({
      seller,
      items,
      totalMinor: items.reduce((sum, item) => sum + item.amount * item.quantity, 0),
    }));
  });

  // ─── Carrito: SH-12 `syn-cart-shell` (#22) ──────────────────────────────────
  // La vitrina es la pieza; acá sólo se traduce el motor a sus datos. Todos los
  // importes salen YA formateados: la pieza no hace aritmética a propósito, y el
  // total de esta tienda lo decide `reprice()`, no una suma de la plantilla.
  readonly cartLines = computed<readonly CartLine[]>(() =>
    this.carrito.cartItems().map((item) => ({
      id: item.id,
      label: this.presentacion.itemLineLabel(item),
      unit: `${this.itemUnitLabel(item)} c/u`,
      total: this.presentacion.itemLineTotalLabel(item),
      quantity: item.quantity,
      groupId: this.presentacion.itemString(item.selection, 'seller') || DEFAULT_SELLER_GROUP,
    })),
  );

  readonly cartGroupHeaders = computed<readonly CartGroup[]>(() =>
    this.cartGroups().map((group) => ({
      id: group.seller,
      label: `Vendido por ${group.seller}`,
      total: this.groupTotalLabel(group),
    })),
  );

  /**
   * El vencimiento más cercano de las líneas apartadas. El más cercano y no el
   * del carrito: el primero que se muera se lleva la compra entera, así que
   * enseñar cualquier otro sería prometer un tiempo que no existe.
   */
  readonly cartHoldExpiresAt = computed<string | null>(() => {
    const vencimientos = this.carrito.cartItems()
      .map((item) => item.expiresAt)
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .sort();
    return vencimientos[0] ?? null;
  });

  readonly cartPageConfig = computed<CartShellConfig>(() => ({
    heading: 'Tu carrito',
    emptyMessage: 'Tu carrito está vacío.',
    holdLabel: 'Tenemos tus artículos reservados',
    holdExpiredLabel: 'La reserva venció. Vuelve a agregar los artículos para continuar.',
  }));

  readonly cartDrawerConfig = computed<CartShellConfig>(() => ({
    ...this.cartPageConfig(),
    heading: 'Carrito',
    density: 'drawer',
    closeLabel: 'Cerrar carrito',
  }));

  readonly cartPageActions = computed<readonly CartAction[]>(() => [
    { id: 'continue', label: 'Seguir comprando', visibility: 'always' },
    { id: 'checkout', label: 'Continuar compra', kind: 'primary' },
  ]);

  readonly cartDrawerActions = computed<readonly CartAction[]>(() => [
    { id: 'view', label: 'Ver carrito' },
    { id: 'checkout', label: 'Ir a pagar', kind: 'primary' },
  ]);

  onCartAction(id: string): void {
    switch (id) {
      case 'continue':
        this.navegacion.continueShopping();
        break;
      case 'view':
        this.navegacion.goToCart();
        break;
      case 'checkout':
        this.navegacion.goToCheckout();
        break;
      default:
        break;
    }
  }

  onCartQuantity(change: CartQuantityChange): void {
    const item = this.carrito.cartItems().find((i) => i.id === change.id);
    if (item) {
      this.carrito.setLineQuantity(item, change.quantity);
    }
  }

  /**
   * El apartado venció mientras la persona miraba el carrito. No se vacía solo
   * —borrarle la selección sin avisar es peor que la selección muerta— pero sí
   * se repregunta el precio: es lo que destapa que ya no hay existencias.
   */
  onCartHoldExpired(): void {
    this.carrito.reprice();
    this.carrito.emitCartUpdate();
  }

  itemUnitLabel(item: SessionItem): string {
    return this.carrito.formatMinor(item.amount);
  }

  groupTotalLabel(group: CartSellerGroup): string {
    return this.carrito.formatMinor(group.totalMinor);
  }

  readonly appliedPromo = computed<AppliedPromo | null>(() => {
    const promo = this.carrito.promo();
    if (!promo) {
      return null;
    }
    return {
      code: promo.code,
      // El importe llega negativo; se muestra con su signo, ya formateado.
      discountLabel: `−${this.carrito.formatMinor(Math.abs(promo.amountMinor))}`,
      ...(promo.detail ? { detail: promo.detail } : {}),
    };
  });

  /**
   * El resumen del carrito: líneas del `breakdown` + total.
   *
   * Se pasa a SH-12 como `summary` y no como `total` a secas porque **es la única
   * forma de que el descuento se VEA**. Un total más bajo sin la línea que lo
   * explica se lee como un error de precio.
   */
  readonly cartSummaryRows = computed<readonly CartSummaryRow[]>(() => {
    const promo = this.carrito.promo();
    if (!promo) {
      return [];
    }
    const subtotal = this.#store
      .items()
      .reduce((sum, item) => sum + item.amount * item.quantity, 0);
    return [
      {
        id: 'subtotal',
        label: 'Subtotal',
        value: this.carrito.formatMinor(subtotal),
      },
      {
        id: 'promo',
        label: promo.label,
        value: `−${this.carrito.formatMinor(Math.abs(promo.amountMinor))}`,
      },
      { id: 'total', label: 'Total', value: this.presentacion.cartTotalLabel(), emphasis: true },
    ];
  });

  /** Los motivos del cupón, del diccionario: el control no sabe del negocio. */
  readonly promoConfig = computed<PromoCodeConfig>(() => ({
    messages: {
      unknown: t('Storefront.Purchase.PromoUnknown', 'No encontramos ese código. Revisa que esté bien escrito.'),
      expired: t('Storefront.Purchase.PromoExpired', 'Ese código ya venció.'),
      'too-many-attempts': t(
        'Storefront.Purchase.PromoTooMany',
        'Probaste demasiados códigos que no sirven. Inténtalo más tarde, o compra sin código.',
      ),
    },
    lockedMessage: t('Storefront.Purchase.PromoFixed', 'El cupón queda fijo mientras tu compra está en curso.'),
  }));

  // ─── Cupones: `syn-promo-code` (#29) ────────────────────────────────────────
  //
  // No había forma de dar un descuento. El motor lo soportaba desde el primer día
  // —`PriceLine.amount` dice «can be negative for discounts»— y ningún dominio
  // emitía una línea negativa; lo único que existía era `listPrice`, un precio
  // tachado que nadie podía obtener.
  readonly promoControl = viewChild(PromoCodeComponent);

  /** El cupón quedó aplicado: su control se vacía (lo pide el carrito por la conexión del elemento). */
  limpiarCupon(): void {
    this.promoControl()?.clear();
  }
}
