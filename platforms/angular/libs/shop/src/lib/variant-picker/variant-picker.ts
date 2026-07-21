import type { VariantPickerElementConfig, ProductVariant } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import {
  coerceStringEnumInput,
  coerceStringRecordInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  SelectComponent,
  type SelectOption,
} from '@synergos/shared';

function sanitizeVariantPickerConfig(
  value: Partial<VariantPickerElementConfig>,
): Partial<VariantPickerElementConfig> {
  return omitUndefinedProperties<VariantPickerElementConfig>({
    label: coerceTrimmedStringInput(value.label),
    selectedValue: coerceTrimmedStringInput(value.selectedValue),
    variantType: coerceStringEnumInput(value.variantType, ['color', 'size', 'storage', 'custom'] as const),
    displayAs: coerceStringEnumInput(value.displayAs, ['buttons', 'swatches', 'dropdown'] as const),
    variantsJson: coerceTrimmedStringInput(value.variantsJson),
    theme: coerceTrimmedStringInput(value.theme),
    variant: coerceTrimmedStringInput(value.variant),
    variantKey: coerceTrimmedStringInput(value.variantKey),
    translations: coerceStringRecordInput(value.translations),
  });
}

@Component({
  selector: 'sg-variant-picker',
  imports: [SelectComponent],
  templateUrl: './variant-picker.html',
  styleUrl: './variant-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-variant-picker' },
})
export class VariantPickerComponent {
  private parseLegacyVariantsJson(raw: string | undefined): ProductVariant[] {
    if (!raw?.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.flatMap((entry, index) => {
        if (typeof entry !== 'object' || entry === null) {
          return [];
        }

        const record = entry as Record<string, unknown>;
        const value = typeof record['value'] === 'string' ? record['value'] : '';
        const label = typeof record['label'] === 'string' ? record['label'] : value;
        if (!value && !label) {
          return [];
        }

        return [{
          id: `${index}-${value || label}`,
          sku: '',
          name: label,
          value: value || label,
          type: 'custom' as const,
          inStock: true,
        }];
      });
    } catch {
      return [];
    }
  }

  readonly config = input<Partial<VariantPickerElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<VariantPickerElementConfig>(sanitizeVariantPickerConfig),
  });

  readonly variantsInput    = input<ProductVariant[]>([], { alias: 'variants' });
  readonly variantsJsonInput = input<string | undefined>(undefined, { alias: 'variantsJson' });
  readonly selectedValueInput = input<string | undefined>(undefined, { alias: 'selectedValue' });
  readonly labelInput       = input<string | undefined>(undefined, { alias: 'label' });
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
    (this.variantsInput().length > 0
      ? this.variantsInput()
      : this.parseLegacyVariantsJson(this.variantsJsonInput() ?? this.config()?.variantsJson))
      .filter((v) => v.type === this.variantType() || v.type === 'custom'),
  );

  readonly selectedVariant = computed(() =>
    this.variants().find((v) => v.id === this.selectedVariantId()) ?? null,
  );

  readonly hostClasses = computed(
    () => `sg-variant-picker--${this.displayAs()} sg-variant-picker--${this.theme()}`,
  );

  readonly selectLabel = computed(
    () => this.labelInput() ?? this.config()?.label ?? this.translations()['Shop.Product.SelectVariant'] ?? 'Select an option',
  );
  readonly outOfStockLabel = computed(
    () => this.translations()['Shop.Product.OutOfStock'] ?? 'Out of stock',
  );

  // Convert variants to SelectOption[] for syn-select
  readonly selectOptions = computed<SelectOption[]>(() =>
    this.variants().map((v) => ({
      value:    v.id,
      label:    v.inStock ? v.name : `${v.name} - ${this.outOfStockLabel()}`,
      disabled: !v.inStock,
    })),
  );

  readonly selectedValue = computed(() => this.selectedVariantId() ?? '');

  constructor() {
    effect(() => {
      const next = this.selectedValueInput() ?? this.config()?.selectedValue ?? null;
      if (next !== this.selectedVariantId()) {
        this.selectedVariantId.set(next);
      }
    });
  }

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

