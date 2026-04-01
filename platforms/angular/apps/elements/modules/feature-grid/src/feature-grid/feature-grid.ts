import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  numberAttribute,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  GridColumnsComponent,
  HeadingComponent,
  type HeadingTone,
} from '@synergos/shared';

interface FeatureGridItem {
  readonly body: string;
  readonly heading: string;
  readonly icon: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeFeatureGridItem(value: unknown): FeatureGridItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const heading = readString(value['heading']).trim();
  const body = readString(value['body']).trim();

  if (!heading && !body) {
    return null;
  }

  return {
    heading,
    body,
    icon: readString(value['icon']).trim(),
  };
}

@Component({
  selector: 'sg-feature-grid',
  imports: [GridColumnsComponent, HeadingComponent],
  templateUrl: './feature-grid.html',
  styleUrl: './feature-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-feature-grid' },
})
export class FeatureGridComponent {
  readonly #initialData = inject(InitialDataService);

  readonly headingText = input<string>('');
  readonly columns = input(3, { transform: numberAttribute });
  readonly items = input<string>('[]');
  readonly theme = input<string>('light');

  readonly parsedItems = computed<readonly FeatureGridItem[]>(() => {
    const parsedValue = this.#initialData.parseValue<unknown>(this.items());

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map((item) => normalizeFeatureGridItem(item))
      .filter((item): item is FeatureGridItem => item !== null);
  });
  readonly resolvedColumns = computed(() => (this.columns() > 0 ? this.columns() : 3));
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly hostClasses = computed(() => `sg-feature-grid--${this.theme()}`);
}
