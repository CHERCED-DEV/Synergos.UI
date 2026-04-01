import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ButtonComponent, HeadingComponent, type HeadingTone } from '@synergos/shared';

@Component({
  selector: 'sg-media-text',
  imports: [ButtonComponent, HeadingComponent],
  templateUrl: './media-text.html',
  styleUrl: './media-text.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-media-text' },
})
export class MediaTextComponent {
  readonly imageSrc = input<string>('');
  readonly imageAlt = input<string>('');
  readonly headingText = input<string>('');
  readonly body = input<string>('');
  readonly ctaLabel = input<string>('');
  readonly ctaUrl = input<string>('');
  readonly mediaPosition = input<string>('left');
  readonly theme = input<string>('light');

  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly hostClasses = computed(
    () => `sg-media-text--${this.mediaPosition()} sg-media-text--${this.theme()}`,
  );
}
