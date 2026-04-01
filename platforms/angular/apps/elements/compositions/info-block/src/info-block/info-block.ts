import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ButtonComponent, HeadingComponent, type HeadingTone } from '@synergos/shared';

@Component({
  selector: 'sg-info-block',
  imports: [ButtonComponent, HeadingComponent],
  templateUrl: './info-block.html',
  styleUrl: './info-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-info-block' },
})
export class InfoBlockComponent {
  readonly title = input<string>('');
  readonly body = input<string>('');
  readonly ctaLabel = input<string>('');
  readonly ctaUrl = input<string>('');
  readonly variant = input<string>('default');
  readonly theme = input<string>('light');

  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly hostClasses = computed(
    () => `sg-info-block--${this.variant()} sg-info-block--${this.theme()}`,
  );
}
