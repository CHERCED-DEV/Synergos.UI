import type { SectionElementConfig } from '@synergos/contracts';
import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  HeadingComponent,
  type HeadingAlign,
  type HeadingLevel,
  type HeadingTone,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

const sectionHeadingLevels: readonly HeadingLevel[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

function resolveSectionHeadingLevel(value: string): HeadingLevel {
  return sectionHeadingLevels.includes(value as HeadingLevel) ? (value as HeadingLevel) : 'h2';
}

function sanitizeSectionConfig(value: Partial<SectionElementConfig>): Partial<SectionElementConfig> {
  return omitUndefinedProperties<Partial<SectionElementConfig>>({
    headingText: coerceTrimmedStringInput(value.headingText),
    headingLevel: coerceTrimmedStringInput(value.headingLevel),
    containerType: coerceTrimmedStringInput(value.containerType),
    alignment: coerceTrimmedStringInput(value.alignment),
    direction: coerceTrimmedStringInput(value.direction),
    margin: coerceTrimmedStringInput(value.margin),
    padding: coerceTrimmedStringInput(value.padding),
    gap: coerceTrimmedStringInput(value.gap),
    variant: coerceTrimmedStringInput(value.variant),
    theme: coerceTrimmedStringInput(value.theme),
  });
}

@Component({
  selector: 'sg-section',
  templateUrl: './section.html',
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle, HeadingComponent],
  host: { class: 'sg-section' },
})
export class SectionComponent {
  readonly config = input<Partial<SectionElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<SectionElementConfig>>(sanitizeSectionConfig),
  });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly headingLevelInput = input<string | undefined>(undefined, { alias: 'headingLevel' });
  readonly containerTypeInput = input<string | undefined>(undefined, { alias: 'containerType' });
  readonly alignmentInput = input<string | undefined>(undefined, { alias: 'alignment' });
  readonly directionInput = input<string | undefined>(undefined, { alias: 'direction' });
  readonly marginInput = input<string | undefined>(undefined, { alias: 'margin' });
  readonly paddingInput = input<string | undefined>(undefined, { alias: 'padding' });
  readonly gapInput = input<string | undefined>(undefined, { alias: 'gap' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly headingText = computed(() => resolveConfigValue(this.headingTextInput()?.trim(), this.config()?.headingText, ''));
  readonly headingLevel = computed(() => resolveConfigValue(this.headingLevelInput()?.trim(), this.config()?.headingLevel, 'h2'));
  readonly containerType = computed(() => resolveConfigValue(this.containerTypeInput()?.trim(), this.config()?.containerType, 'fluid'));
  readonly alignment = computed(() => resolveConfigValue(this.alignmentInput()?.trim(), this.config()?.alignment, 'start'));
  readonly direction = computed(() => resolveConfigValue(this.directionInput()?.trim(), this.config()?.direction, 'column'));
  readonly margin = computed(() => resolveConfigValue(this.marginInput()?.trim(), this.config()?.margin, ''));
  readonly padding = computed(() => resolveConfigValue(this.paddingInput()?.trim(), this.config()?.padding, ''));
  readonly gap = computed(() => resolveConfigValue(this.gapInput()?.trim(), this.config()?.gap, '1rem'));
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );

  readonly hasHeading = computed(() => this.headingText().trim().length > 0);
  readonly resolvedHeadingLevel = computed<HeadingLevel>(() =>
    resolveSectionHeadingLevel(this.headingLevel()),
  );
  readonly headingAlign = computed<HeadingAlign>(() =>
    this.alignment() === 'center' ? 'center' : 'start',
  );
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(
    () => `sg-section--${this.variant()} sg-section--${this.theme()} sg-section--${this.containerType()}`,
  );
  readonly containerStyles = computed(() => ({
    'align-items': this.alignment(),
    'flex-direction': this.direction(),
    gap: this.gap(),
    margin: this.margin() || null,
    padding: this.padding() || null,
  }));
}
