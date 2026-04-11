import type { PriceDisplayElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';

@Component({
  selector: 'sg-price-display',
  templateUrl: './price-display.html',
  styleUrl: './price-display.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-price-display' },
})
export class PriceDisplayComponent {
  readonly config = input<Partial<PriceDisplayElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<PriceDisplayElementConfig>,
  });

  // Direct attribute inputs (allow usage without config JSON)
  readonly priceInput         = input<number | undefined>(undefined, { alias: 'price' });
  readonly originalPriceInput = input<number | undefined>(undefined, { alias: 'originalPrice' });
  readonly discountInput      = input<number | undefined>(undefined, { alias: 'discount' });
  readonly currencyInput      = input<string | undefined>(undefined, { alias: 'currency' });
  readonly priceSizeInput     = input<string | undefined>(undefined, { alias: 'priceSize' });
  readonly themeInput         = input<string | undefined>(undefined, { alias: 'theme' });

  readonly price         = input<number | undefined>(undefined);
  readonly originalPrice = input<number | undefined>(undefined);
  readonly discount      = input<number | undefined>(undefined);

  // Resolved values
  readonly showOriginalPrice = computed(() => this.config()?.showOriginalPrice ?? true);
  readonly showDiscount      = computed(() => this.config()?.showDiscount      ?? true);
  readonly priceSize         = computed(() =>
    resolveConfigValue(this.priceSizeInput(), this.config()?.priceSize, 'md'),
  );
  readonly currency = computed(() =>
    resolveConfigValue(this.currencyInput(), this.config()?.currency, 'COP'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );

  // Price values come from inputs OR from the parent's data binding
  readonly currentPrice    = computed(() => this.priceInput() ?? this.price());
  readonly basePrice       = computed(() => this.originalPriceInput() ?? this.originalPrice());
  readonly discountPercent = computed(() => this.discountInput() ?? this.discount());

  readonly hasDiscount     = computed(() => (this.discountPercent() ?? 0) > 0 && this.showDiscount());
  readonly hasOriginal     = computed(() => !!this.basePrice() && this.showOriginalPrice());
  readonly hostClasses     = computed(() => `sg-price-display--${this.priceSize()} sg-price-display--${this.theme()}`);

  formatPrice(value: number | undefined): string {
    if (value == null) return '';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: this.currency(),
      maximumFractionDigits: 0,
    }).format(value);
  }
}
