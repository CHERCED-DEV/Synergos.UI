import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  AccordionComponent,
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

type AccordionTone = 'neutral' | 'brand';

export interface FaqItemConfig {
  readonly question?: string;
  readonly answer?: string;
  readonly initiallyExpanded?: boolean;
  readonly theme?: string;
}

@Component({
  selector: 'sg-faq-item',
  standalone: true,
  imports: [AccordionComponent],
  templateUrl: './faq-item.html',
  styleUrl: './faq-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-faq-item' },
})
export class FaqItemElementComponent {
  readonly configInput = input<Partial<FaqItemConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<FaqItemConfig>,
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
    resolveConfigValue(this.initiallyExpandedInput(), this.configInput()?.initiallyExpanded, false),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );
  readonly accordionTone = computed<AccordionTone>(() =>
    this.theme() === 'dark' ? 'brand' : 'neutral',
  );
  readonly hostClasses = computed(() => `faq-item--${this.theme()}`);
}
