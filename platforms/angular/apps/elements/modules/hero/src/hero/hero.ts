import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  ButtonComponent,
  HeadingComponent,
  type HeadingLevel,
  type HeadingTone,
} from '@synergos/shared';

const heroHeadingLevels: readonly HeadingLevel[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

function resolveHeroHeadingLevel(value: string): HeadingLevel {
  return heroHeadingLevels.includes(value as HeadingLevel) ? (value as HeadingLevel) : 'h1';
}

@Component({
  selector: 'sg-hero',
  imports: [ButtonComponent, HeadingComponent],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-hero' },
})
export class HeroComponent {
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

  readonly hasImage = computed(() => this.imageSrc().trim().length > 0);
  readonly hasCta = computed(() => this.ctaLabel().trim().length > 0 && this.ctaUrl().trim().length > 0);
  readonly resolvedHeadingLevel = computed<HeadingLevel>(() =>
    resolveHeroHeadingLevel(this.headingLevel()),
  );
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly hostClasses = computed(
    () => `sg-hero--${this.variant()} sg-hero--${this.theme()}`,
  );
}
