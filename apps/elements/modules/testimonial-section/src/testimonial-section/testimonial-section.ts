import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  effect,
  inject,
} from '@angular/core';
import { LoggerService } from '@synergos/core';
import { AvatarComponent } from '@synergos/shared';

@Component({
  selector: 'sg-testimonial-section',
  imports: [AvatarComponent],
  templateUrl: './testimonial-section.html',
  styleUrl: './testimonial-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-testimonial-section' },
})
export class TestimonialSectionComponent {
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
  readonly hostClasses = computed(() => `sg-testimonial-section--${this.theme()}`);

  constructor() {
    effect(() => {
      this.#logger.debug('[synergos-testimonial-section] inputs', {
        headingText: this.headingText(),
        items: this.items(),
        theme: this.theme(),
      });
    });
  }
}
