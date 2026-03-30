import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { LoggerService } from '@synergos/core';
import { ButtonComponent } from '@synergos/shared';

@Component({
  selector: 'sg-banner',
  imports: [ButtonComponent],
  templateUrl: './banner.html',
  styleUrl: './banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-banner' },
})
export class BannerComponent {
  readonly #logger = inject(LoggerService);

  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly title = input<string>('');
  readonly body = input<string>('');
  readonly ctaLabel = input<string>('');
  readonly ctaUrl = input<string>('');
  readonly ctaTarget = input<string>('_self');
  readonly variant = input<string>('default');
  readonly theme = input<string>('light');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly hasCta = computed(() => !!this.ctaLabel() && !!this.ctaUrl());
  readonly hostClasses = computed(
    () => `sg-banner--${this.variant()} sg-banner--${this.theme()}`
  );

  constructor() {
    effect(() => {
      this.#logger.debug('[synergos-banner] inputs', {
        title: this.title(),
        variant: this.variant(),
        theme: this.theme(),
      });
    });
  }
}
