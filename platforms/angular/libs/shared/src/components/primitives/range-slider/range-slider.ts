import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';

@Component({
  selector: 'syn-range-slider',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-range-slider">
      @if (label()) {
        <label class="syn-range-slider__label" [attr.for]="inputId()">{{ label() }}</label>
      }

      <div class="syn-range-slider__track">
        <input
          class="syn-range-slider__input"
          [id]="inputId()"
          type="range"
          [disabled]="disabled()"
          [min]="min()"
          [max]="max()"
          [step]="step()"
          [value]="currentValue()"
          [style.--syn-range-progress]="progress() + '%'"
          (input)="onInput($event)"
          (change)="commit()"
        />
      </div>

      @if (showValue()) {
        <div class="syn-range-slider__value">{{ currentValue() }}</div>
      }
    </div>
  `,
  styleUrl: './range-slider.scss',
})
export class RangeSliderComponent {
  readonly #generatedId = `syn-range-slider-${Math.random().toString(36).slice(2, 10)}`;

  readonly id = input('');
  readonly label = input('');
  readonly value = input(0);
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  readonly disabled = input(false);
  readonly showValue = input(true);

  readonly currentValue = linkedSignal(() => this.normalizeValue(this.value()));
  readonly inputId = computed(() => this.id() || this.#generatedId);
  readonly progress = computed(() => {
    const span = this.max() - this.min();
    if (span <= 0) {
      return 0;
    }

    return ((this.currentValue() - this.min()) * 100) / span;
  });

  readonly valueChange = output<number>();
  readonly valueCommitted = output<number>();

  onInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const nextValue = this.normalizeValue(Number(target.value));
    this.currentValue.set(nextValue);
    this.valueChange.emit(nextValue);
  }

  commit(): void {
    this.valueCommitted.emit(this.currentValue());
  }

  private normalizeValue(value: number): number {
    if (Number.isNaN(value)) {
      return this.min();
    }

    return Math.min(this.max(), Math.max(this.min(), value));
  }
}
