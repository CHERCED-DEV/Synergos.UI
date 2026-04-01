import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  AvatarComponent,
  GridColumnsComponent,
  HeadingComponent,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
} from '@synergos/shared';

interface TestimonialItem {
  readonly avatarSrc: string;
  readonly name: string;
  readonly quote: string;
  readonly role: string;
}

export interface TestimonialSectionConfig {
  readonly headingText?: string;
  readonly items?: readonly TestimonialItem[];
  readonly theme?: string;
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
  host: { class: 'sg-testimonial-section' },
})
export class TestimonialSectionComponent {
  readonly #initialData = inject(InitialDataService);

  readonly configInput = input<Partial<TestimonialSectionConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<TestimonialSectionConfig>,
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

  readonly parsedItems = computed<readonly TestimonialItem[]>(() => {
    if (this.itemsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.items());

      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map((item) => normalizeTestimonialItem(item))
        .filter((item): item is TestimonialItem => item !== null);
    }

    return (this.configInput()?.items ?? [])
      .map((item) => normalizeTestimonialItem(item))
      .filter((item): item is TestimonialItem => item !== null);
  });
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly hostClasses = computed(() => `sg-testimonial-section--${this.theme()}`);
}
