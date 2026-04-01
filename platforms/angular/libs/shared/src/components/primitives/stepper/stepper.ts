import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';

@Component({
  selector: 'syn-stepper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-stepper">
      @if (label()) {
        <label class="syn-stepper__label" [attr.for]="inputId()">{{ label() }}</label>
      }

      <div class="syn-stepper__control">
        <button
          type="button"
          class="syn-stepper__button"
          [disabled]="disabled() || currentValue() <= min()"
          [attr.aria-label]="decrementLabel()"
          (click)="decrement()"
        >
          -
        </button>

        <input
          class="syn-stepper__input"
          [id]="inputId()"
          type="number"
          [disabled]="disabled()"
          [min]="min()"
          [max]="max()"
          [step]="step()"
          [value]="currentValue()"
          (input)="onInput($event)"
        />

        <button
          type="button"
          class="syn-stepper__button"
          [disabled]="disabled() || currentValue() >= max()"
          [attr.aria-label]="incrementLabel()"
          (click)="increment()"
        >
          +
        </button>
      </div>
    </div>
  `,
  styleUrl: './stepper.scss',
})
export class StepperComponent {
  readonly #generatedId = `syn-stepper-${Math.random().toString(36).slice(2, 10)}`;

  readonly id = input('');
  readonly label = input('');
  readonly value = input(0);
  readonly min = input(0);
  readonly max = input(10);
  readonly step = input(1);
  readonly disabled = input(false);
  readonly incrementLabel = input('Increase value');
  readonly decrementLabel = input('Decrease value');

  readonly currentValue = linkedSignal(() => this.normalizeValue(this.value()));
  readonly inputId = computed(() => this.id() || this.#generatedId);

  readonly valueChange = output<number>();

  increment(): void {
    this.updateValue(this.currentValue() + this.step());
  }

  decrement(): void {
    this.updateValue(this.currentValue() - this.step());
  }

  onInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    this.updateValue(Number(target.value));
  }

  private updateValue(nextValue: number): void {
    const normalized = this.normalizeValue(nextValue);
    this.currentValue.set(normalized);
    this.valueChange.emit(normalized);
  }

  private normalizeValue(value: number): number {
    if (Number.isNaN(value)) {
      return this.min();
    }

    return Math.min(this.max(), Math.max(this.min(), value));
  }
}
