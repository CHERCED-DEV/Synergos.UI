import { ChangeDetectionStrategy, Component, computed, effect, inject, input, isDevMode } from '@angular/core';
import type { TestimonialSectionElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import {
  AvatarComponent,
  GridColumnsComponent,
  HeadingComponent,
  type HeadingTone,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

interface TestimonialItem {
  readonly avatarSrc: string;
  readonly name: string;
  readonly quote: string;
  readonly role: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeTestimonialItem(value: unknown): TestimonialItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = readString(value['name']).trim();
  const quote = readString(value['quote']).trim();

  if (!name || !quote) {
    return null;
  }

  return {
    name,
    quote,
    role: readString(value['role']).trim(),
    avatarSrc: readString(value['avatarSrc']).trim(),
  };
}

function normalizeTestimonialItems(value: unknown): readonly TestimonialItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => normalizeTestimonialItem(item))
    .filter((item): item is TestimonialItem => item !== null);

  return items.length > 0 ? items : undefined;
}

function sanitizeTestimonialSectionConfig(
  value: Partial<TestimonialSectionElementConfig>,
): Partial<TestimonialSectionElementConfig> {
  return omitUndefinedProperties<TestimonialSectionElementConfig>({
    headingText: coerceTrimmedStringInput(value.headingText),
    theme: coerceTrimmedStringInput(value.theme),
    items: normalizeTestimonialItems(value.items) as Partial<TestimonialSectionElementConfig>['items'],
  });
}

@Component({
  selector: 'sg-testimonial-section',
  imports: [AvatarComponent, GridColumnsComponent, HeadingComponent],
  templateUrl: './testimonial-section.html',
  styleUrl: './testimonial-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-testimonial-section', '[style.display]': 'hasItems() ? null : "none"' },
})
export class TestimonialSectionComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<Partial<TestimonialSectionElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<TestimonialSectionElementConfig>(sanitizeTestimonialSectionConfig),
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

  readonly parsedItems = computed<readonly TestimonialItem[]>(() => {
    if (this.itemsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.itemsInput());

      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map((item) => normalizeTestimonialItem(item))
        .filter((item): item is TestimonialItem => item !== null);
    }

    const configItems = normalizeTestimonialItems(this.config()?.items);
    if (configItems) {
      return configItems;
    }

    return [];
  });
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hasItems = computed(() => this.parsedItems().length > 0);
  readonly hostClasses = computed(
    () => `testimonial-section--${this.theme()} sg-testimonial-section--${this.theme()}`,
  );

  constructor() {
    if (isDevMode()) {
      effect(() => {
        if (!this.hasItems() && (this.itemsInput() !== undefined || this.config() !== undefined)) {
          console.warn('[synergos-testimonial-section] Items resolved to empty. Check your "items" attribute or "config.items" array format.');
        }
      });
    }
  }
}
