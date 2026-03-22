import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { LoggerService } from '@synergos/core';

@Component({
  selector: 'sg-hero',
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-hero' },
})
export class HeroComponent {
  readonly #logger = inject(LoggerService);

  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly headingText = input<string>('');
  readonly headingLevel = input<string>('h1');
  readonly body = input<string>('');
  readonly imageSrc = input<string>('');
  readonly imageAlt = input<string>('');
  readonly ctaLabel = input<string>('');
  readonly ctaUrl = input<string>('');
  readonly ctaTarget = input<string>('_self');
  readonly variant = input<string>('default');
  readonly theme = input<string>('light');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly hasImage = computed(() => !!this.imageSrc());
  readonly hasCta = computed(() => !!this.ctaLabel() && !!this.ctaUrl());
  readonly hostClasses = computed(
    () => `sg-hero--${this.variant()} sg-hero--${this.theme()}`
  );

  constructor() {
    effect(() => {
      this.#logger.debug('[synergos-hero] inputs', {
        headingText: this.headingText(),
        variant: this.variant(),
        theme: this.theme(),
      });
    });
  }
}
