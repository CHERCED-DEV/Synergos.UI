import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { FaqItemElementConfig } from '@synergos/contracts';
import {
  AccordionComponent,
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

type AccordionTone = 'neutral' | 'brand';

@Component({
  selector: 'sg-faq-item',
  imports: [AccordionComponent],
  templateUrl: './faq-item.html',
  styleUrl: './faq-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-faq-item' },
})
export class FaqItemElementComponent {
  readonly configInput = input<Partial<FaqItemElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<FaqItemElementConfig>,
  });
  readonly questionInput = input<string | undefined>(undefined, { alias: 'question' });
  readonly answerInput = input<string | undefined>(undefined, { alias: 'answer' });
  readonly initiallyExpandedInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'initiallyExpanded',
    transform: coerceOptionalBooleanInput,
  });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly question = computed(() =>
    resolveConfigValue(this.questionInput(), this.configInput()?.question, ''),
  );
  readonly answer = computed(() =>
    resolveConfigValue(this.answerInput(), this.configInput()?.answer, ''),
  );
  readonly initiallyExpanded = computed(() =>
    resolveConfigValue(this.initiallyExpandedInput(), undefined, false),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );
  readonly accordionTone = computed<AccordionTone>(() =>
    this.theme() === 'dark' ? 'brand' : 'neutral',
  );
  readonly hostClasses = computed(() => `faq-item--${this.theme()}`);
}
