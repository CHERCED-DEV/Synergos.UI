import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ButtonComponent, HeadingComponent, type HeadingTone } from '@synergos/shared';

@Component({
  selector: 'sg-banner',
  imports: [ButtonComponent, HeadingComponent],
  templateUrl: './banner.html',
  styleUrl: './banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-banner' },
})
export class BannerComponent {
  readonly title = input<string>('');
  readonly body = input<string>('');
  readonly ctaLabel = input<string>('');
  readonly ctaUrl = input<string>('');
  readonly ctaTarget = input<string>('_self');
  readonly variant = input<string>('default');
  readonly theme = input<string>('light');

  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly hostClasses = computed(
    () => `sg-banner--${this.variant()} sg-banner--${this.theme()}`,
  );
}
