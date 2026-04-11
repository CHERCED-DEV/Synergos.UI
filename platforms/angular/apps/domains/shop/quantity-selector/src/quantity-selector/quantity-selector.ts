import type { QuantitySelectorElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { coerceConfigInput, resolveConfigValue, IconButtonComponent } from '@synergos/shared';

@Component({
  selector: 'sg-quantity-selector',
  imports: [IconButtonComponent],
  templateUrl: './quantity-selector.html',
  styleUrl: './quantity-selector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-quantity-selector' },
})
export class QuantitySelectorComponent {
  readonly config = input<Partial<QuantitySelectorElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<QuantitySelectorElementConfig>,
  });

  readonly minInput     = input<number | undefined>(undefined, { alias: 'min' });
  readonly maxInput     = input<number | undefined>(undefined, { alias: 'max' });
  readonly stepInput    = input<number | undefined>(undefined, { alias: 'step' });
  readonly valueInput   = input<number | undefined>(undefined, { alias: 'value' });
  readonly themeInput   = input<string | undefined>(undefined, { alias: 'theme' });

  // Angular output — also dispatched as native CustomEvent for cross-framework
  readonly quantityChange = output<number>();

  // Resolved config
  readonly min  = computed(() => resolveConfigValue(this.minInput(),  this.config()?.min,  1));
  readonly max  = computed(() => resolveConfigValue(this.maxInput(),  this.config()?.max,  99));
  readonly step = computed(() => resolveConfigValue(this.stepInput(), this.config()?.step, 1));
  readonly theme = computed(() => resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'));

  // Internal state
  readonly quantity = signal(this.valueInput() ?? 1);

  readonly canDecrement = computed(() => this.quantity() > this.min());
  readonly canIncrement = computed(() => this.quantity() < this.max());
  readonly hostClasses  = computed(() => `sg-quantity-selector--${this.theme()}`);

  decrement(): void {
    if (!this.canDecrement()) return;
    const next = Math.max(this.min(), this.quantity() - this.step());
    this.quantity.set(next);
    this.emit(next);
  }

  increment(): void {
    if (!this.canIncrement()) return;
    const next = Math.min(this.max(), this.quantity() + this.step());
    this.quantity.set(next);
    this.emit(next);
  }

  onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).valueAsNumber;
    if (isNaN(raw)) return;
    const clamped = Math.min(this.max(), Math.max(this.min(), raw));
    this.quantity.set(clamped);
    this.emit(clamped);
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
