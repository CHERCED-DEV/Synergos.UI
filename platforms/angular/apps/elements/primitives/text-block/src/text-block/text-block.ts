import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { TextBlockElementConfig } from '@synergos/contracts';
import {
  HeadingComponent,
  type HeadingAlign,
  type HeadingLevel,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
  resolveHeadingTone,
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
  readonly configInput = input<Partial<TextBlockElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<TextBlockElementConfig>,
  });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly headingLevelInput = input<string | undefined>(undefined, { alias: 'headingLevel' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly alignmentInput = input<string | undefined>(undefined, { alias: 'alignment' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.configInput()?.headingText, ''),
  );
  readonly headingLevel = computed(() =>
    resolveConfigValue(this.headingLevelInput(), this.configInput()?.headingLevel, 'h2'),
  );
  readonly body = computed(() =>
    resolveConfigValue(this.bodyInput(), undefined, ''),
  );
  readonly alignment = computed(() =>
    resolveConfigValue(this.alignmentInput(), undefined, 'left'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

  readonly headingAlign = computed<HeadingAlign>(() =>
    this.alignment() === 'center' ? 'center' : 'start',
  );
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly resolvedHeadingLevel = computed<HeadingLevel>(() =>
    resolveTextBlockHeadingLevel(this.headingLevel()),
  );
  readonly hostClasses = computed(
    () => `sg-text-block--${this.alignment()} sg-text-block--${this.variant()} sg-text-block--${this.theme()}`,
  );
}
