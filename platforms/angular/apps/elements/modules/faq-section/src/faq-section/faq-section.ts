import { ChangeDetectionStrategy, Component, computed, effect, inject, input, isDevMode } from '@angular/core';
import type { FaqSectionElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import {
  AccordionComponent,
  HeadingComponent,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

interface FaqItem {
  readonly answer: string;
  readonly initiallyExpanded: boolean;
  readonly question: string;
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
  host: { class: 'sg-faq-section', '[style.display]': 'hasItems() ? null : "none"' },
})
export class FaqSectionComponent {
  readonly #initialData = inject(InitialDataService);

  readonly configInput = input<Partial<FaqSectionElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<FaqSectionElementConfig>,
  });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.configInput()?.headingText, ''),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );

  readonly parsedItems = computed<readonly FaqItem[]>(() => {
    if (this.itemsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.itemsInput());

      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map((item) => normalizeFaqItem(item))
        .filter((item): item is FaqItem => item !== null);
    }

    const configItems = this.configInput()?.items;
    if (Array.isArray(configItems)) {
      return (configItems as unknown[])
        .map((item) => normalizeFaqItem(item))
        .filter((item): item is FaqItem => item !== null);
    }

    return [];
  });
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hasItems = computed(() => this.parsedItems().length > 0);
  readonly hostClasses = computed(() => `sg-faq-section--${this.theme()}`);

  constructor() {
    if (isDevMode()) {
      effect(() => {
        if (!this.hasItems() && (this.itemsInput() !== undefined || this.configInput() !== undefined)) {
          console.warn('[synergos-faq-section] Items resolved to empty. Check your "items" attribute or "config.items" array format.');
        }
      });
    }
  }
}
