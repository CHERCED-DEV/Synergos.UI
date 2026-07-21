import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { TextBlockElementConfig } from '@synergos/contracts';
import {
  HeadingComponent,
  type HeadingAlign,
  type HeadingLevel,
  type HeadingTone,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

const textBlockHeadingLevels: readonly HeadingLevel[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

function resolveTextBlockHeadingLevel(value: string): HeadingLevel {
  return textBlockHeadingLevels.includes(value as HeadingLevel) ? (value as HeadingLevel) : 'h2';
}

function sanitizeTextBlockConfig(
  value: Partial<TextBlockElementConfig>,
): Partial<TextBlockElementConfig> {
  return omitUndefinedProperties<Partial<TextBlockElementConfig>>({
    headingText: coerceTrimmedStringInput(value.headingText),
    headingLevel: coerceStringEnumInput(value.headingLevel, textBlockHeadingLevels),
    body: coerceTrimmedStringInput(value.body),
    alignment: coerceTrimmedStringInput(value.alignment),
    variant: coerceTrimmedStringInput(value.variant),
    theme: coerceTrimmedStringInput(value.theme),
  });
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
  readonly config = input<Partial<TextBlockElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<TextBlockElementConfig>>(sanitizeTextBlockConfig),
  });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly headingLevelInput = input<string | undefined>(undefined, { alias: 'headingLevel' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly alignmentInput = input<string | undefined>(undefined, { alias: 'alignment' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.config()?.headingText, ''),
  );
  readonly headingLevel = computed(() =>
    resolveConfigValue(this.headingLevelInput(), this.config()?.headingLevel, 'h2'),
  );
  readonly body = computed(() => resolveConfigValue(this.bodyInput(), this.config()?.body, ''));
  readonly alignment = computed(() => resolveConfigValue(this.alignmentInput(), this.config()?.alignment, 'left'));
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
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
