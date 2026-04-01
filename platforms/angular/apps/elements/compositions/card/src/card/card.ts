import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BadgeComponent, ButtonComponent, HeadingComponent, type HeadingTone } from '@synergos/shared';

@Component({
  selector: 'sg-card',
  imports: [BadgeComponent, ButtonComponent, HeadingComponent],
  templateUrl: './card.html',
  styleUrl: './card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-card' },
})
export class CardComponent {
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

  readonly hasImage = computed(() => this.imageSrc().trim().length > 0);
  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly hasBadge = computed(() => this.badgeText().trim().length > 0);
  readonly badgeTone = computed(() => (this.badgeType() === 'info' ? 'brand' : 'neutral'));
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly hostClasses = computed(
    () => `sg-card--${this.variant()} sg-card--${this.theme()}`,
  );
}
