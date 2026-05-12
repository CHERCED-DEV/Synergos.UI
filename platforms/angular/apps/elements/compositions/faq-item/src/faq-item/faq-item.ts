import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { FaqItemElementConfig } from '@synergos/contracts';
import {
  AccordionComponent,
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

type AccordionTone = 'neutral' | 'brand';

function sanitizeFaqItemConfig(
  value: Partial<FaqItemElementConfig>,
): Partial<FaqItemElementConfig> {
  return omitUndefinedProperties<FaqItemElementConfig>({
    question: coerceTrimmedStringInput(value.question),
    answer: coerceTrimmedStringInput(value.answer),
    initiallyExpanded: coerceOptionalBooleanInput(value.initiallyExpanded),
    theme: coerceTrimmedStringInput(value.theme),
  });
}

@Component({
  selector: 'sg-faq-item',
  imports: [AccordionComponent],
  templateUrl: './faq-item.html',
  styleUrl: './faq-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-faq-item' },
})
export class FaqItemElementComponent {
  readonly config = input<Partial<FaqItemElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<FaqItemElementConfig>(sanitizeFaqItemConfig),
  });
  readonly questionInput = input<string | undefined>(undefined, { alias: 'question' });
  readonly answerInput = input<string | undefined>(undefined, { alias: 'answer' });
  readonly initiallyExpandedInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'initiallyExpanded',
    transform: coerceOptionalBooleanInput,
  });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly question = computed(() =>
    resolveConfigValue(this.questionInput(), this.config()?.question, ''),
  );
  readonly answer = computed(() =>
    resolveConfigValue(this.answerInput(), this.config()?.answer, ''),
  );
  readonly initiallyExpanded = computed(() =>
    resolveConfigValue(this.initiallyExpandedInput(), this.config()?.initiallyExpanded, false),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly accordionTone = computed<AccordionTone>(() =>
    this.theme() === 'dark' ? 'brand' : 'neutral',
  );
  readonly hostClasses = computed(() => `faq-item--${this.theme()} sg-faq-item--${this.theme()}`);
}
