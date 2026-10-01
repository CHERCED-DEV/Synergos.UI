import type { CartSummaryElementConfig } from '@synergos/contracts';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  coerceOptionalBooleanInput,
  coerceStringRecordInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  IconButtonComponent,
  ButtonComponent,
  InputComponent,
  EmptyStateComponent,
  FocusManagerService,
} from '@synergos/shared';
import { CartItemComponent, cartStore } from '@synergos/shop';

/**
 * El atributo `open` como orden: presente o `"true"` abre, `"false"` cierra, ausente
 * no dice nada (#87). Sin esto el input recibía la CADENA: `open=""` —la forma HTML de
 * un booleano— valía `''`, falsa, y `open="false"` valía `'false'`, verdadera.
 */
function coerceOpenAttribute(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  return String(value).trim().toLowerCase() !== 'false';
}

function sanitizeCartSummaryConfig(
  value: Partial<CartSummaryElementConfig>,
): Partial<CartSummaryElementConfig> {
  return omitUndefinedProperties<CartSummaryElementConfig>({
    title: coerceTrimmedStringInput(value.title),
    summaryTitle: coerceTrimmedStringInput(value.summaryTitle),
    showCoupon: coerceOptionalBooleanInput(value.showCoupon),
    checkoutUrl: coerceTrimmedStringInput(value.checkoutUrl),
    checkoutEndpoint: coerceTrimmedStringInput(value.checkoutEndpoint),
    continueShoppingUrl: coerceTrimmedStringInput(value.continueShoppingUrl),
    showShipping: coerceOptionalBooleanInput(value.showShipping),
    showTax: coerceOptionalBooleanInput(value.showTax),
    theme: coerceTrimmedStringInput(value.theme),
    variant: coerceTrimmedStringInput(value.variant),
    variantKey: coerceTrimmedStringInput(value.variantKey),
    translations: coerceStringRecordInput(value.translations),
  });
}

@Component({
  selector: 'sg-cart-summary',
  imports: [CartItemComponent, IconButtonComponent, ButtonComponent, InputComponent, EmptyStateComponent],
  templateUrl: './cart-summary.html',
  styleUrl: './cart-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-cart-summary',
    // El estado se REFLEJA en `data-open`, nunca en `open` (#87). `open` es un input
    // observado: reflejarlo ahí hacía que @angular/elements leyera de vuelta el `""` que
    // acababa de escribir, el input cerraba el cajón, el reflejo lo quitaba… y Angular
    // cortaba con NG0103 (detección de cambios infinita). Medido en el banco: el cajón
    // NO llegaba a abrirse nunca, ni por el atributo ni por el carrito.
    '[attr.data-open]': "isOpen() ? '' : null",
  },
})
export class CartSummaryComponent {
  readonly dialogTitleId = `sg-cart-summary-title-${Math.random().toString(36).slice(2, 10)}`;

  readonly config = input<Partial<CartSummaryElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<CartSummaryElementConfig>(sanitizeCartSummaryConfig),
  });

  readonly openInput          = input<boolean | undefined, unknown>(undefined, {
    alias: 'open',
    transform: coerceOpenAttribute,
  });
  readonly titleInput         = input<string | undefined>(undefined, { alias: 'title' });
  readonly summaryTitleInput  = input<string | undefined>(undefined, { alias: 'summaryTitle' });
  readonly checkoutUrlInput   = input<string | undefined>(undefined, { alias: 'checkoutUrl' });
  readonly checkoutEndpointInput = input<string | undefined>(undefined, { alias: 'checkoutEndpoint' });
  readonly themeInput         = input<string | undefined>(undefined, { alias: 'theme' });
  readonly variantInput       = input<string | undefined>(undefined, { alias: 'variant' });

  // Config-resolved
  readonly showCoupon          = computed(() => this.config()?.showCoupon ?? false);
  readonly title               = computed(() =>
    resolveConfigValue(this.titleInput() ?? this.summaryTitleInput(), this.config()?.title ?? this.config()?.summaryTitle, ''),
  );
  /**
   * Adónde lleva «Ir a pagar»: la ruta que compuso el editor (`checkoutEndpoint` en el CMS)
   * o NINGUNA. Traía `/checkout` por defecto, una ruta que no existe en ningún sitio del CMS:
   * el botón prometía un pago que acababa en un 404 (CMS#188). Sin ruta no hay botón.
   */
  readonly checkoutUrl         = computed(() =>
    resolveConfigValue(this.checkoutUrlInput() ?? this.checkoutEndpointInput(), this.config()?.checkoutUrl ?? this.config()?.checkoutEndpoint, ''),
  );
  readonly continueShoppingUrl = computed(() =>
    resolveConfigValue(undefined, this.config()?.continueShoppingUrl, '/'),
  );
  readonly theme               = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly translations        = computed(() => this.config()?.translations ?? {});

  /**
   * Abierto o cerrado lo dice el CARRITO. El atributo `open` es una orden que se le da
   * (abrir/cerrar), no una segunda fuente: con las dos, `open=""` dejaba el cajón
   * abierto para siempre porque cerrar sólo cerraba el store.
   */
  readonly isOpen = cartStore.open;

  // Cart state from store
  readonly items    = cartStore.items;
  readonly count    = cartStore.count;
  readonly subtotal = cartStore.subtotal;
  readonly total    = cartStore.total;
  readonly isEmpty  = cartStore.isEmpty;

  // Coupon
  readonly couponCode = signal('');
  readonly couponApplied = cartStore.coupon;

  // Translation helpers
  // Los respaldos van en es-CO (UI#91, regla 44): decían «Shopping cart», «Proceed to
  // checkout», «Close cart»… en un sitio en español, porque `translations` no lo alimenta
  // ninguna vista del CMS. Este elemento no tiene record, así que todavía no traduce con `t()`.
  readonly t = computed(() => this.translations());
  readonly titleLabel          = computed(() => this.title() || (this.t()['Shop.Cart.Title'] ?? 'Tu carrito'));
  readonly emptyLabel          = computed(() => this.t()['Shop.Cart.Empty']           ?? 'Tu carrito está vacío');
  readonly subtotalLabel       = computed(() => this.t()['Shop.Cart.Subtotal']        ?? 'Subtotal');
  readonly totalLabel          = computed(() => this.t()['Shop.Cart.Total']           ?? 'Total');
  readonly checkoutLabel       = computed(() => this.t()['Shop.Cart.Checkout']        ?? 'Ir a pagar');
  readonly continueLabel       = computed(() => this.t()['Shop.Cart.ContinueShopping'] ?? 'Seguir comprando');
  readonly closeLabel          = computed(() => this.t()['Shop.Cart.Close']            ?? 'Cerrar el carrito');
  readonly closeBackdropLabel  = computed(() => this.t()['Shop.Cart.CloseBackdrop']    ?? this.closeLabel());
  readonly couponLabel         = computed(() => this.t()['Shop.Cart.Coupon']          ?? 'Código de descuento');
  readonly applyCouponLabel    = computed(() => this.t()['Shop.Cart.ApplyCoupon']     ?? 'Aplicar');
  readonly cartItemsLabel      = computed(() => this.t()['Shop.Cart.Items']           ?? 'Productos en el carrito');
  readonly totalsLabel         = computed(() => this.t()['Shop.Cart.Totals']          ?? 'Totales del carrito');
  readonly itemsCountLabel     = computed(() => {
    const n = this.count();
    const plantilla = this.t()['Shop.Cart.ItemsCount'] ?? (n === 1 ? '{count} producto' : '{count} productos');
    return plantilla.replace('{count}', String(n));
  });

  readonly hostClasses = computed(() => `sg-cart-summary--${this.theme()}`);

  // ── Foco (#87) ─────────────────────────────────────────────────────────────
  // Un `aria-modal` que se abre sin mover el foco deja al teclado DETRÁS del modal: el
  // lector anuncia el cajón y el Tab sigue recorriendo la página que el modal dice tapar.
  // Al abrir, el foco entra (al botón de cerrar); con Tab no sale; al cerrar vuelve a
  // quien lo tenía. Y cerrado, el cajón es `inert`: antes sus seis controles seguían en
  // el orden de tabulación, fuera de la pantalla y con `aria-hidden`.
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #injector = inject(Injector);
  readonly #focus = inject(FocusManagerService);
  #abierto = false;
  #quienAbrio: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const orden = this.openInput();
      untracked(() => {
        if (orden === true) cartStore.openDrawer();
        else if (orden === false) cartStore.closeDrawer();
      });
    });

    effect(() => {
      const abierto = this.isOpen();
      untracked(() => this.#alCambiarApertura(abierto));
    });
  }

  #alCambiarApertura(abierto: boolean): void {
    if (abierto === this.#abierto || typeof document === 'undefined') return;
    this.#abierto = abierto;
    const host = this.#host.nativeElement;

    if (abierto) {
      const activo = document.activeElement;
      this.#quienAbrio = activo instanceof HTMLElement && !host.contains(activo) ? activo : null;
      // Después del render: antes, el cajón sigue `inert` y no acepta el foco.
      afterNextRender(() => this.#enfocarDentro(), { injector: this.#injector });
      return;
    }

    const destino = this.#quienAbrio;
    this.#quienAbrio = null;
    // Sólo si el foco seguía en el cajón: si alguien ya lo llevó a otra parte, no se le roba.
    if (destino?.isConnected && host.contains(document.activeElement)) destino.focus();
  }

  #enfocarDentro(): void {
    const panel = this.#panel();
    if (!panel || !this.isOpen()) return;
    const cerrar = panel.querySelector<HTMLElement>('.cart-drawer__close button');
    (cerrar ?? this.#focus.getFocusableElements(panel)[0] ?? panel).focus();
  }

  #panel(): HTMLElement | null {
    return this.#host.nativeElement.querySelector<HTMLElement>('.cart-drawer');
  }

  /** Tab no sale del cajón abierto: del último vuelve al primero y al revés. */
  onDrawerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.isOpen()) return;
    const enfocables = this.#focus.getFocusableElements(this.#panel());
    if (enfocables.length === 0) {
      event.preventDefault();
      return;
    }
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    const activo = document.activeElement;
    if (event.shiftKey && (activo === primero || activo === this.#panel())) {
      event.preventDefault();
      ultimo.focus();
    } else if (!event.shiftKey && activo === ultimo) {
      event.preventDefault();
      primero.focus();
    }
  }

  close(): void { cartStore.closeDrawer(); }

  applyCoupon(): void {
    const code = this.couponCode().trim();
    if (!code) return;
    // Stub — real implementation calls /api/shop/cart/coupon
    cartStore.applyDiscount(code, 0);
  }

  formatPrice(value: number): string {
    const currency = this.items()[0]?.currency ?? 'COP';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(value);
  }
}
