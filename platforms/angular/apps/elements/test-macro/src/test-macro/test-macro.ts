import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LoggerService } from '@synergos/core';

@Component({
  selector: 'sg-test-macro',
  templateUrl: './test-macro.html',
  styleUrl: './test-macro.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-test-macro' },
})
export class TestMacroComponent {
  readonly #logger = inject(LoggerService);

  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly userId = input<string>();
  readonly title = input<string>();

  // ── Internal state ────────────────────────────────────────────────────────
  readonly text = signal('');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly uppercaseText = computed(() => this.text().toUpperCase());

  // ── Outputs ───────────────────────────────────────────────────────────────
  readonly textChanged = output<string>();

  constructor() {
    // Log input changes — effect() discards EffectRef intentionally:
    // lifecycle is tied to the component injector, no manual cleanup needed.
    effect(() => {
      this.#logger.debug('[sg-test-macro] inputs', {
        userId: this.userId(),
        title: this.title(),
      });
    });

    effect(() => {
      this.#logger.debug('[sg-test-macro] text changed', this.text());
    });
  }

  // ── Event handlers ────────────────────────────────────────────────────────
  onTextInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.text.set(value);
    this.textChanged.emit(value);
  }
}
