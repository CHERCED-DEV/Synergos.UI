import type { VariantPickerElementConfig, ProductVariant } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { coerceConfigInput, resolveConfigValue, SelectComponent, type SelectOption } from '@synergos/shared';

@Component({
  selector: 'sg-variant-picker',
  imports: [SelectComponent],
  templateUrl: './variant-picker.html',
  styleUrl: './variant-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-variant-picker' },
})
export class VariantPickerComponent {
  readonly config = input<Partial<VariantPickerElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<VariantPickerElementConfig>,
  });

  readonly variantsInput    = input<ProductVariant[]>([], { alias: 'variants' });
  readonly variantTypeInput = input<string | undefined>(undefined, { alias: 'variantType' });
  readonly displayAsInput   = input<string | undefined>(undefined, { alias: 'displayAs' });
  readonly themeInput       = input<string | undefined>(undefined, { alias: 'theme' });

  readonly variantSelected = output<ProductVariant | null>();

  readonly variantType = computed(() =>
    resolveConfigValue(this.variantTypeInput(), this.config()?.variantType, 'size'),
  );
  readonly displayAs = computed(() =>
    resolveConfigValue(this.displayAsInput(), this.config()?.displayAs, 'buttons'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly translations = computed(() => this.config()?.translations ?? {});

  readonly selectedVariantId = signal<string | null>(null);

  readonly variants = computed(() =>
    this.variantsInput().filter((v) => v.type === this.variantType()),
  );

  readonly selectedVariant = computed(() =>
    this.variants().find((v) => v.id === this.selectedVariantId()) ?? null,
  );

  readonly hostClasses = computed(
    () => `sg-variant-picker--${this.displayAs()} sg-variant-picker--${this.theme()}`,
  );

  readonly selectLabel = computed(
    () => this.translations()['Shop.Product.SelectVariant'] ?? 'Select an option',
  );
  readonly outOfStockLabel = computed(
    () => this.translations()['Shop.Product.OutOfStock'] ?? 'Out of stock',
  );

  // Convert variants to SelectOption[] for syn-select
  readonly selectOptions = computed<SelectOption[]>(() =>
    this.variants().map((v) => ({
      value:    v.id,
      label:    v.inStock ? v.name : `${v.name} — ${this.outOfStockLabel()}`,
      disabled: !v.inStock,
    })),
  );

  readonly selectedValue = computed(() => this.selectedVariantId() ?? '');

  onDropdownChange(variantId: string): void {
    const variant = this.variants().find((v) => v.id === variantId) ?? null;
    if (variant && !variant.inStock) return;
    this.selectedVariantId.set(variantId || null);
    this.variantSelected.emit(variant);
    window.dispatchEvent(
      new CustomEvent('sg:variant:selected', {
        bubbles: true, composed: true,
        detail: { variant },
      }),
    );
  }

  selectVariant(variant: ProductVariant): void {
    if (!variant.inStock) return;
    const next = this.selectedVariantId() === variant.id ? null : variant.id;
    this.selectedVariantId.set(next);
    const selected = next ? variant : null;
    this.variantSelected.emit(selected);
    window.dispatchEvent(
      new CustomEvent('sg:variant:selected', {
        bubbles: true, composed: true,
        detail: { variant: selected },
      }),
    );
  }

  isSelected(variant: ProductVariant): boolean {
    return this.selectedVariantId() === variant.id;
  }

  trackById(_: number, v: ProductVariant): string { return v.id; }
}
