import type { CartItemElementConfig } from '@synergos/contracts';
import type { CartItem } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceOptionalNumberInput,
  coerceStringRecordInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  IconButtonComponent,
} from '@synergos/shared';
import { QuantitySelectorComponent } from '../quantity-selector/quantity-selector';
import { cartStore } from '../cart.store';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeCartItem(value: unknown): CartItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const productId = coerceTrimmedStringInput(value['productId']);
  const sku = coerceTrimmedStringInput(value['sku']);
  const name = coerceTrimmedStringInput(value['name']);
  const price = coerceOptionalNumberInput(value['price']);
  const currency = coerceTrimmedStringInput(value['currency']);
  const quantity = coerceOptionalNumberInput(value['quantity']);
  const subtotal = coerceOptionalNumberInput(value['subtotal']);

  if (
    !productId
    || !sku
    || !name
    || price === undefined
    || !currency
    || quantity === undefined
    || subtotal === undefined
  ) {
    return undefined;
  }

  return {
    productId,
    variantId: coerceTrimmedStringInput(value['variantId']),
    sku,
    name,
    image: coerceTrimmedStringInput(value['image']),
    price,
    currency,
    quantity,
    subtotal,
  };
}

function sanitizeCartItemConfig(
  value: Partial<CartItemElementConfig>,
): Partial<CartItemElementConfig> {
  return omitUndefinedProperties<CartItemElementConfig>({
    item: sanitizeCartItem(value.item),
    productSku: coerceTrimmedStringInput(value.productSku),
    quantity: coerceOptionalNumberInput(value.quantity),
    unitPrice: coerceTrimmedStringInput(value.unitPrice),
    updateEndpoint: coerceTrimmedStringInput(value.updateEndpoint),
    theme: coerceTrimmedStringInput(value.theme),
    variant: coerceTrimmedStringInput(value.variant),
    variantKey: coerceTrimmedStringInput(value.variantKey),
    translations: coerceStringRecordInput(value.translations),
  });
}

@Component({
  selector: 'sg-cart-item',
  imports: [QuantitySelectorComponent, IconButtonComponent],
  templateUrl: './cart-item.html',
  styleUrl: './cart-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-cart-item' },
})
export class CartItemComponent {
  readonly quantityLabelId = `sg-cart-item-qty-${Math.random().toString(36).slice(2, 10)}`;

  readonly config = input<Partial<CartItemElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<CartItemElementConfig>(sanitizeCartItemConfig),
  });

  readonly itemInput = input<CartItem | undefined>(undefined, { alias: 'item' });
  readonly item = computed(() => this.itemInput() ?? this.config()?.item);

  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });
  readonly theme = computed(() => resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'));

  readonly translations = computed(() => this.config()?.translations ?? {});

  readonly removeLabel = computed(() => this.translations()['Shop.Cart.Remove'] ?? 'Remove');
  readonly qtyLabel = computed(() => this.translations()['Shop.Product.Quantity'] ?? 'Quantity');

  readonly hasImage = computed(() => !!this.item()?.image);

  formatPrice(value: number, currency: string): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(value);
  }

  updateQty(qty: number): void {
    const item = this.item();
    if (!item) return;
    cartStore.updateQuantity(item.productId, qty, item.variantId);
  }

  remove(): void {
    const item = this.item();
    if (!item) return;
    cartStore.remove(item.productId, item.variantId);
  }
}
