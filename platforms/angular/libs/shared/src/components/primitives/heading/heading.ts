import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import {
  coerceOptionalBooleanInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '../../../utils/config-input.util';

export type HeadingAlign = 'start' | 'center';
export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
export type HeadingSize = 'sm' | 'md' | 'lg' | 'xl';
export type HeadingTone = 'neutral' | 'muted' | 'brand' | 'inverse';

export interface HeadingConfig {
  readonly text?: string;
  readonly eyebrow?: string;
  readonly supportingText?: string;
  readonly level?: HeadingLevel;
  readonly size?: HeadingSize;
  readonly tone?: HeadingTone;
  readonly align?: HeadingAlign;
  readonly visuallyHidden?: boolean;
}

function sanitizeHeadingConfig(value: Partial<HeadingConfig>): Partial<HeadingConfig> {
  return omitUndefinedProperties<HeadingConfig>({
    text: coerceTrimmedStringInput(value.text),
    eyebrow: coerceTrimmedStringInput(value.eyebrow),
    supportingText: coerceTrimmedStringInput(value.supportingText),
    level: coerceStringEnumInput(value.level, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const),
    size: coerceStringEnumInput(value.size, ['sm', 'md', 'lg', 'xl'] as const),
    tone: coerceStringEnumInput(value.tone, ['neutral', 'muted', 'brand', 'inverse'] as const),
    align: coerceStringEnumInput(value.align, ['start', 'center'] as const),
    visuallyHidden: coerceOptionalBooleanInput(value.visuallyHidden),
  });
}

@Component({
  selector: 'syn-heading',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-heading" [class]="headingClass()">
      @if (eyebrow()) {
        <span class="syn-heading__eyebrow">{{ eyebrow() }}</span>
      }

      @switch (level()) {
        @case ('h1') {
          <h1 class="syn-heading__title" [class.syn-heading__title--hidden]="visuallyHidden()">
            {{ text() }}
          </h1>
        }
        @case ('h2') {
          <h2 class="syn-heading__title" [class.syn-heading__title--hidden]="visuallyHidden()">
            {{ text() }}
          </h2>
        }
        @case ('h3') {
          <h3 class="syn-heading__title" [class.syn-heading__title--hidden]="visuallyHidden()">
            {{ text() }}
          </h3>
        }
        @case ('h4') {
          <h4 class="syn-heading__title" [class.syn-heading__title--hidden]="visuallyHidden()">
            {{ text() }}
          </h4>
        }
        @case ('h5') {
          <h5 class="syn-heading__title" [class.syn-heading__title--hidden]="visuallyHidden()">
            {{ text() }}
          </h5>
        }
        @default {
          <h6 class="syn-heading__title" [class.syn-heading__title--hidden]="visuallyHidden()">
            {{ text() }}
          </h6>
        }
      }

      @if (supportingText()) {
        <p class="syn-heading__supporting">{{ supportingText() }}</p>
      }
    </div>
  `,
  styleUrl: './heading.scss',
})
export class HeadingComponent {
  readonly config = input<Partial<HeadingConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<HeadingConfig>(sanitizeHeadingConfig),
  });
  readonly textInput = input<string | undefined>(undefined, { alias: 'text' });
  readonly eyebrowInput = input<string | undefined>(undefined, { alias: 'eyebrow' });
  readonly supportingTextInput = input<string | undefined>(undefined, {
    alias: 'supportingText',
  });
  readonly levelInput = input<HeadingLevel | undefined>(undefined, { alias: 'level' });
  readonly sizeInput = input<HeadingSize | undefined>(undefined, { alias: 'size' });
  readonly toneInput = input<HeadingTone | undefined>(undefined, { alias: 'tone' });
  readonly alignInput = input<HeadingAlign | undefined>(undefined, { alias: 'align' });
  readonly visuallyHiddenInput = input<boolean | undefined>(undefined, {
    alias: 'visuallyHidden',
  });

  readonly text = computed(() =>
    resolveConfigValue(this.textInput(), this.config()?.text, ''),
  );
  readonly eyebrow = computed(() =>
    resolveConfigValue(this.eyebrowInput(), this.config()?.eyebrow, ''),
  );
  readonly supportingText = computed(() =>
    resolveConfigValue(this.supportingTextInput(), this.config()?.supportingText, ''),
  );
  readonly level = computed(() =>
    resolveConfigValue(this.levelInput(), this.config()?.level, 'h2'),
  );
  readonly size = computed(() =>
    resolveConfigValue(this.sizeInput(), this.config()?.size, 'md'),
  );
  readonly tone = computed(() =>
    resolveConfigValue(this.toneInput(), this.config()?.tone, 'neutral'),
  );
  readonly align = computed(() =>
    resolveConfigValue(this.alignInput(), this.config()?.align, 'start'),
  );
  readonly visuallyHidden = computed(() =>
    resolveConfigValue(this.visuallyHiddenInput(), this.config()?.visuallyHidden, false),
  );

  headingClass(): string {
    return classNames(
      'syn-heading',
      `syn-heading--${this.size()}`,
      `syn-heading--${this.tone()}`,
      `syn-heading--${this.align()}`,
    );
  }
}
