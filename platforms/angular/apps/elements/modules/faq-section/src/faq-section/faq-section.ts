import { ChangeDetectionStrategy, Component, computed, effect, inject, input, isDevMode } from '@angular/core';
import type { FaqSectionElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import {
  AccordionComponent,
  HeadingComponent,
  type HeadingTone,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

interface FaqItem {
  readonly answer: string;
  readonly initiallyExpanded: boolean;
  readonly question: string;
}

type AccordionTone = 'neutral' | 'brand';

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

function normalizeFaqItems(value: unknown): readonly FaqItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => normalizeFaqItem(item))
    .filter((item): item is FaqItem => item !== null);

  return items.length > 0 ? items : undefined;
}

function sanitizeFaqSectionConfig(
  value: Partial<FaqSectionElementConfig>,
): Partial<FaqSectionElementConfig> {
  return omitUndefinedProperties<FaqSectionElementConfig>({
    headingText: coerceTrimmedStringInput(value.headingText),
    theme: coerceTrimmedStringInput(value.theme),
    items: normalizeFaqItems(value.items) as Partial<FaqSectionElementConfig>['items'],
  });
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

  readonly config = input<Partial<FaqSectionElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<FaqSectionElementConfig>(sanitizeFaqSectionConfig),
  });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.config()?.headingText, ''),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
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

    const configItems = normalizeFaqItems(this.config()?.items);
    if (configItems) {
      return configItems;
    }

    return [];
  });
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly accordionTone = computed<AccordionTone>(() =>
    this.theme() === 'dark' ? 'brand' : 'neutral',
  );
  readonly hasItems = computed(() => this.parsedItems().length > 0);
  readonly hostClasses = computed(
    () => `faq-section--${this.theme()} sg-faq-section--${this.theme()}`,
  );

  constructor() {
    if (isDevMode()) {
      effect(() => {
        if (!this.hasItems() && (this.itemsInput() !== undefined || this.config() !== undefined)) {
          console.warn('[synergos-faq-section] Items resolved to empty. Check your "items" attribute or "config.items" array format.');
        }
      });
    }
  }
}
