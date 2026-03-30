import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { LoggerService } from '@synergos/core';
import { ButtonComponent, BadgeComponent } from '@synergos/shared';

@Component({
  selector: 'sg-card',
  imports: [ButtonComponent, BadgeComponent],
  templateUrl: './card.html',
  styleUrl: './card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-card' },
})
export class CardComponent {
  readonly #logger = inject(LoggerService);

  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly body = input<string>('');
  readonly imageSrc = input<string>('');
  readonly imageAlt = input<string>('');
  readonly ctaLabel = input<string>('');
  readonly ctaUrl = input<string>('');
  readonly badgeText = input<string>('');
  readonly badgeType = input<string>('');
  readonly variant = input<string>('default');
  readonly theme = input<string>('light');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly hasImage = computed(() => !!this.imageSrc());
  readonly hasCta = computed(() => !!this.ctaLabel() && !!this.ctaUrl());
  readonly hasBadge = computed(() => !!this.badgeText());
  readonly badgeTone = computed(() => {
    const type = this.badgeType();
    return type === 'info' ? 'brand' : 'neutral';
  });
  readonly hostClasses = computed(
    () => `sg-card--${this.variant()} sg-card--${this.theme()}`
  );

  constructor() {
    effect(() => {
      this.#logger.debug('[synergos-card] inputs', {
        title: this.title(),
        variant: this.variant(),
        theme: this.theme(),
      });
    });
  }
}
