import { ChangeDetectionStrategy, Component, computed, effect, inject, input, isDevMode } from '@angular/core';
import type { TestimonialSectionElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import {
  AvatarComponent,
  GridColumnsComponent,
  HeadingComponent,
  type HeadingTone,
  coerceConfigInput,
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

  readonly configInput = input<Partial<TestimonialSectionElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<TestimonialSectionElementConfig>,
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

    const configItems = this.configInput()?.items;
    if (Array.isArray(configItems)) {
      return (configItems as unknown[])
        .map((item) => normalizeTestimonialItem(item))
        .filter((item): item is TestimonialItem => item !== null);
    }

    return [];
  });
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hasItems = computed(() => this.parsedItems().length > 0);
  readonly hostClasses = computed(() => `sg-testimonial-section--${this.theme()}`);

  constructor() {
    if (isDevMode()) {
      effect(() => {
        if (!this.hasItems() && (this.itemsInput() !== undefined || this.configInput() !== undefined)) {
          console.warn('[synergos-testimonial-section] Items resolved to empty. Check your "items" attribute or "config.items" array format.');
        }
      });
    }
  }
}
