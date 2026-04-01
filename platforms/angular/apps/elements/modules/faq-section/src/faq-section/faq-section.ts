import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  AccordionComponent,
  HeadingComponent,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
} from '@synergos/shared';

interface FaqItem {
  readonly answer: string;
  readonly initiallyExpanded: boolean;
  readonly question: string;
}

export interface FaqSectionConfig {
  readonly headingText?: string;
  readonly items?: readonly FaqItem[];
  readonly theme?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeFaqItem(value: unknown): FaqItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const question = readString(value['question']).trim();
  const answer = readString(value['answer']).trim();

  if (!question || !answer) {
    return null;
  }

  return {
    question,
    answer,
    initiallyExpanded: value['initiallyExpanded'] === true,
  };
}

@Component({
  selector: 'sg-faq-section',
  imports: [AccordionComponent, HeadingComponent],
  templateUrl: './faq-section.html',
  styleUrl: './faq-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-faq-section' },
})
export class FaqSectionComponent {
  readonly #initialData = inject(InitialDataService);

  readonly configInput = input<Partial<FaqSectionConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<FaqSectionConfig>,
  });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.configInput()?.headingText, ''),
  );
  readonly items = computed(() =>
    resolveConfigValue(this.itemsInput(), undefined, '[]'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

  readonly parsedItems = computed<readonly FaqItem[]>(() => {
    if (this.itemsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.items());

      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map((item) => normalizeFaqItem(item))
        .filter((item): item is FaqItem => item !== null);
    }

    return (this.configInput()?.items ?? [])
      .map((item) => normalizeFaqItem(item))
      .filter((item): item is FaqItem => item !== null);
  });
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly hostClasses = computed(() => `sg-faq-section--${this.theme()}`);
}
