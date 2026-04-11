import type { CartItemElementConfig } from '@synergos/contracts';
import type { CartItem } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { coerceConfigInput, resolveConfigValue, IconButtonComponent } from '@synergos/shared';
import { QuantitySelectorComponent } from '../../../quantity-selector/src/quantity-selector/quantity-selector';
import { cartStore } from '../../../cart.store';

@Component({
  selector: 'sg-cart-item',
  imports: [QuantitySelectorComponent, IconButtonComponent],
  templateUrl: './cart-item.html',
  styleUrl: './cart-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-cart-item' },
})
export class CartItemComponent {
  readonly config = input<Partial<CartItemElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<CartItemElementConfig>,
  });

  // The item data — can come from config or direct binding from cart-summary
  readonly itemInput = input<CartItem | undefined>(undefined, { alias: 'item' });

  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });
  readonly theme = computed(() => resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'));

  readonly translations = computed(() => this.config()?.translations ?? {});

  // Labels
  readonly removeLabel  = computed(() => this.translations()['Shop.Cart.Remove']   ?? 'Remove');
  readonly qtyLabel     = computed(() => this.translations()['Shop.Product.Quantity'] ?? 'Quantity');

  readonly hasImage = computed(() => !!this.itemInput()?.image);

  formatPrice(value: number, currency: string): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(value);
  }

  updateQty(qty: number): void {
    const item = this.itemInput();
    if (!item) return;
    cartStore.updateQuantity(item.productId, qty, item.variantId);
  }

  remove(): void {
    const item = this.itemInput();
    if (!item) return;
    cartStore.remove(item.productId, item.variantId);
  }
}
