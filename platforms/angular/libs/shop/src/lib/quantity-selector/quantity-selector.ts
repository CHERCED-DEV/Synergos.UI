import type { QuantitySelectorElementConfig } from '@synergos/contracts';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  coerceOptionalNumberInput,
  coerceStringRecordInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

function sanitizeNonNegativeNumber(value: unknown): number | undefined {
  const coercedValue = coerceOptionalNumberInput(value);
  return coercedValue !== undefined && coercedValue >= 0 ? coercedValue : undefined;
}

function sanitizePositiveNumber(value: unknown): number | undefined {
  const coercedValue = coerceOptionalNumberInput(value);
  return coercedValue !== undefined && coercedValue > 0 ? coercedValue : undefined;
}

function sanitizeQuantitySelectorConfig(
  value: Partial<QuantitySelectorElementConfig>,
): Partial<QuantitySelectorElementConfig> {
  const min = sanitizeNonNegativeNumber(value.min ?? value.minQty);
  const maxSource = sanitizeNonNegativeNumber(value.max ?? value.maxQty);
  const max = maxSource !== undefined && min !== undefined && maxSource < min ? min : maxSource;
  const step = sanitizePositiveNumber(value.step);
  const clampedValue = sanitizeNonNegativeNumber(value.value);
  const clampedInitialQty = sanitizeNonNegativeNumber(value.initialQty);

  return omitUndefinedProperties<QuantitySelectorElementConfig>({
    label: coerceTrimmedStringInput(value.label),
    min,
    minQty: min,
    max,
    maxQty: max,
    step,
    value: clampedValue !== undefined && max !== undefined ? Math.min(max, Math.max(min ?? 0, clampedValue)) : clampedValue,
    initialQty: clampedInitialQty !== undefined && max !== undefined ? Math.min(max, Math.max(min ?? 0, clampedInitialQty)) : clampedInitialQty,
    theme: coerceTrimmedStringInput(value.theme),
    variant: coerceTrimmedStringInput(value.variant),
    variantKey: coerceTrimmedStringInput(value.variantKey),
    translations: coerceStringRecordInput(value.translations),
  });
}

@Component({
  selector: 'sg-quantity-selector',
  templateUrl: './quantity-selector.html',
  styleUrl: './quantity-selector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-quantity-selector' },
})
export class QuantitySelectorComponent {
  readonly config = input<Partial<QuantitySelectorElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<QuantitySelectorElementConfig>(sanitizeQuantitySelectorConfig),
  });

  readonly minInput     = input<number | undefined>(undefined, { alias: 'min' });
  readonly minQtyInput  = input<number | undefined>(undefined, { alias: 'minQty' });
  readonly maxInput     = input<number | undefined>(undefined, { alias: 'max' });
  readonly maxQtyInput  = input<number | undefined>(undefined, { alias: 'maxQty' });
  readonly stepInput    = input<number | undefined>(undefined, { alias: 'step' });
  readonly valueInput   = input<number | undefined>(undefined, { alias: 'value' });
  readonly initialQtyInput = input<number | undefined>(undefined, { alias: 'initialQty' });
  readonly themeInput   = input<string | undefined>(undefined, { alias: 'theme' });
  readonly labelInput   = input<string | undefined>(undefined, { alias: 'label' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly ariaLabelledByInput = input<string | undefined>(undefined, { alias: 'ariaLabelledBy' });

  // Angular output — also dispatched as native CustomEvent for cross-framework
  readonly quantityChange = output<number>();

  // Resolved config
  readonly min  = computed(() => resolveConfigValue(this.minInput() ?? this.minQtyInput(),  this.config()?.min ?? this.config()?.minQty,  1));
  readonly max  = computed(() => resolveConfigValue(this.maxInput() ?? this.maxQtyInput(),  this.config()?.max ?? this.config()?.maxQty,  99));
  readonly step = computed(() => resolveConfigValue(this.stepInput(), this.config()?.step, 1));
  readonly theme = computed(() => resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'));
  readonly translations = computed(() => this.config()?.translations ?? {});

  // Internal state
  readonly quantity = signal(1);

  readonly canDecrement = computed(() => this.quantity() > this.min());
  readonly canIncrement = computed(() => this.quantity() < this.max());
  readonly hostClasses  = computed(() => `sg-quantity-selector--${this.theme()}`);
  readonly quantityLabel = computed(
    () => this.labelInput() ?? this.ariaLabelInput() ?? this.config()?.label ?? this.translations()['Shop.Product.Quantity'] ?? 'Quantity',
  );
  readonly decrementLabel = computed(
    () => this.translations()['Shop.Product.DecreaseQuantity'] ?? 'Decrease quantity',
  );
  readonly incrementLabel = computed(
    () => this.translations()['Shop.Product.IncreaseQuantity'] ?? 'Increase quantity',
  );
  readonly ariaLabelledBy = computed(() => this.ariaLabelledByInput() ?? null);

  constructor() {
    effect(() => {
      const incoming = this.valueInput() ?? this.initialQtyInput();
      const fallback = this.config()?.value ?? this.config()?.initialQty ?? this.min();
      const next = this.clamp(incoming ?? fallback);
      const current = untracked(this.quantity);
      if (next !== current) {
        this.quantity.set(next);
      }
    });
  }

  decrement(): void {
    if (!this.canDecrement()) return;
    this.setQuantity(this.quantity() - this.step());
  }

  increment(): void {
    if (!this.canIncrement()) return;
    this.setQuantity(this.quantity() + this.step());
  }

  onInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const raw = target.valueAsNumber;
    if (Number.isNaN(raw)) {
      return;
    }

    this.setQuantity(raw);
  }

  private setQuantity(nextValue: number): void {
    const next = this.clamp(nextValue);
    if (next === this.quantity()) {
      return;
    }

    this.quantity.set(next);
    this.emit(next);
  }

  private clamp(value: number): number {
    return Math.min(this.max(), Math.max(this.min(), value));
  }

  private emit(value: number): void {
    this.quantityChange.emit(value);
    window.dispatchEvent(
      new CustomEvent('sg:quantity:change', {
        bubbles: true, composed: true,
        detail: { quantity: value },
      }),
    );
  }
}
