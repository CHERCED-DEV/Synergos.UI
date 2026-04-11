import type { CartSummaryElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, effect, HostBinding, input, signal } from '@angular/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';
import { CartItemComponent } from '../../../cart-item/src/cart-item/cart-item';
import { cartStore } from '../../../cart.store';

@Component({
  selector: 'sg-cart-summary',
  imports: [CartItemComponent],
  templateUrl: './cart-summary.html',
  styleUrl: './cart-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-cart-summary' },
})
export class CartSummaryComponent {
  readonly config = input<Partial<CartSummaryElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<CartSummaryElementConfig>,
  });

  readonly openInput          = input<boolean | undefined>(undefined, { alias: 'open' });
  readonly themeInput         = input<string | undefined>(undefined, { alias: 'theme' });
  readonly variantInput       = input<string | undefined>(undefined, { alias: 'variant' });

  // Config-resolved
  readonly showCoupon          = computed(() => this.config()?.showCoupon ?? false);
  readonly checkoutUrl         = computed(() =>
    resolveConfigValue(undefined, this.config()?.checkoutUrl, '/checkout'),
  );
  readonly continueShoppingUrl = computed(() =>
    resolveConfigValue(undefined, this.config()?.continueShoppingUrl, '/'),
  );
  readonly theme               = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly translations        = computed(() => this.config()?.translations ?? {});

  // Open state — merges host attribute with store signal
  @HostBinding('attr.open')
  get openAttr(): string | null { return this.isOpen() ? '' : null; }

  readonly isOpen = computed(() => this.openInput() ?? cartStore.open());

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
  readonly t = computed(() => this.translations());
  readonly titleLabel          = computed(() => this.t()['Shop.Cart.Title']           ?? 'Shopping cart');
  readonly emptyLabel          = computed(() => this.t()['Shop.Cart.Empty']           ?? 'Your cart is empty');
  readonly subtotalLabel       = computed(() => this.t()['Shop.Cart.Subtotal']        ?? 'Subtotal');
  readonly totalLabel          = computed(() => this.t()['Shop.Cart.Total']           ?? 'Total');
  readonly checkoutLabel       = computed(() => this.t()['Shop.Cart.Checkout']        ?? 'Proceed to checkout');
  readonly continueLabel       = computed(() => this.t()['Shop.Cart.ContinueShopping'] ?? 'Continue shopping');
  readonly couponLabel         = computed(() => this.t()['Shop.Cart.Coupon']          ?? 'Discount code');
  readonly applyCouponLabel    = computed(() => this.t()['Shop.Cart.ApplyCoupon']     ?? 'Apply');
  readonly itemsCountLabel     = computed(() => {
    const n = this.count();
    return (this.t()['Shop.Cart.ItemsCount'] ?? '{count} item(s)').replace('{count}', String(n));
  });

  readonly hostClasses = computed(() => `sg-cart-summary--${this.theme()}`);

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
