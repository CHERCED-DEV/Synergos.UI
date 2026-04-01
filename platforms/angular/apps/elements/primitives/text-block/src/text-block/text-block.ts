import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  HeadingComponent,
  type HeadingAlign,
  type HeadingLevel,
  type HeadingTone,
} from '@synergos/shared';

const textBlockHeadingLevels: readonly HeadingLevel[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

function resolveTextBlockHeadingLevel(value: string): HeadingLevel {
  return textBlockHeadingLevels.includes(value as HeadingLevel) ? (value as HeadingLevel) : 'h2';
}

@Component({
  selector: 'sg-text-block',
  imports: [HeadingComponent],
  templateUrl: './text-block.html',
  styleUrl: './text-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-text-block' },
})
export class TextBlockComponent {
  readonly headingText = input<string>('');
  readonly headingLevel = input<string>('h2');
  readonly body = input<string>('');
  readonly alignment = input<string>('left');
  readonly theme = input<string>('light');

  readonly headingAlign = computed<HeadingAlign>(() =>
    this.alignment() === 'center' ? 'center' : 'start',
  );
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly resolvedHeadingLevel = computed<HeadingLevel>(() =>
    resolveTextBlockHeadingLevel(this.headingLevel()),
  );
  readonly hostClasses = computed(
    () => `sg-text-block--${this.alignment()} sg-text-block--${this.theme()}`,
  );
}
