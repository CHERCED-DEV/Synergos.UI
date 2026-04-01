import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  HeadingComponent,
  type HeadingAlign,
  type HeadingLevel,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
} from '@synergos/shared';

const textBlockHeadingLevels: readonly HeadingLevel[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

export interface TextBlockConfig {
  readonly headingText?: string;
  readonly headingLevel?: string;
  readonly body?: string;
  readonly alignment?: string;
  readonly theme?: string;
}

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
  readonly configInput = input<Partial<TextBlockConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<TextBlockConfig>,
  });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly headingLevelInput = input<string | undefined>(undefined, { alias: 'headingLevel' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly alignmentInput = input<string | undefined>(undefined, { alias: 'alignment' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.configInput()?.headingText, ''),
  );
  readonly headingLevel = computed(() =>
    resolveConfigValue(this.headingLevelInput(), this.configInput()?.headingLevel, 'h2'),
  );
  readonly body = computed(() =>
    resolveConfigValue(this.bodyInput(), this.configInput()?.body, ''),
  );
  readonly alignment = computed(() =>
    resolveConfigValue(this.alignmentInput(), this.configInput()?.alignment, 'left'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

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
