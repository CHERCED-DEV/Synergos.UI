import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  effect,
  inject,
} from '@angular/core';
import { LoggerService } from '@synergos/core';

@Component({
  selector: 'sg-faq-section',
  imports: [],
  templateUrl: './faq-section.html',
  styleUrl: './faq-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-faq-section' },
})
export class FaqSectionComponent {
  readonly #logger = inject(LoggerService);

  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly headingText = input<string>('');
  readonly items = input<string>('[]');
  readonly theme = input<string>('light');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly parsedItems = computed(() => {
    try { return JSON.parse(this.items()); }
    catch { return []; }
  });
  readonly hostClasses = computed(() => `sg-faq-section--${this.theme()}`);

  constructor() {
    effect(() => {
      this.#logger.debug('[synergos-faq-section] inputs', {
        headingText: this.headingText(),
        items: this.items(),
        theme: this.theme(),
      });
    });
  }
}
