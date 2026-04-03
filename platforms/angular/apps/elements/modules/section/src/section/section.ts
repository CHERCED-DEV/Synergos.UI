import type { SectionElementConfig } from '@synergos/contracts';
import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  HeadingComponent,
  type HeadingAlign,
  type HeadingLevel,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

const sectionHeadingLevels: readonly HeadingLevel[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

function resolveSectionHeadingLevel(value: string): HeadingLevel {
  return sectionHeadingLevels.includes(value as HeadingLevel) ? (value as HeadingLevel) : 'h2';
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
  readonly configInput = input<Partial<SectionElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<SectionElementConfig>,
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

  readonly headingText = computed(() => this.headingTextInput()?.trim() || '');
  readonly headingLevel = computed(() => this.headingLevelInput()?.trim() || 'h2');
  readonly containerType = computed(() => this.containerTypeInput()?.trim() || 'fluid');
  readonly alignment = computed(() => this.alignmentInput()?.trim() || 'start');
  readonly direction = computed(() => this.directionInput()?.trim() || 'column');
  readonly margin = computed(() => this.marginInput()?.trim() || '');
  readonly padding = computed(() => this.paddingInput()?.trim() || '');
  readonly gap = computed(() => this.gapInput()?.trim() || '1rem');
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
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
