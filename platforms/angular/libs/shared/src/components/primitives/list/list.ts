import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BadgeComponent } from '../badge/badge';
import { classNames } from '../../../utils/class-names.util';
import {
  coerceOptionalBooleanInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigArray,
  resolveConfigValue,
} from '../../../utils/config-input.util';

export type ListDensity = 'comfortable' | 'compact';
export type ListMarker = 'disc' | 'check' | 'none';

export interface ListItem {
  readonly id?: string;
  readonly label: string;
  readonly supportingText?: string;
  readonly badge?: string;
  readonly disabled?: boolean;
}

export interface ListConfig {
  readonly items?: readonly ListItem[];
  readonly ordered?: boolean;
  readonly marker?: ListMarker;
  readonly density?: ListDensity;
  readonly divided?: boolean;
  readonly interactive?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeListItem(value: unknown): ListItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const label = coerceTrimmedStringInput(value['label']);
  if (!label) {
    return undefined;
  }

  return omitUndefinedProperties<ListItem>({
    id: coerceTrimmedStringInput(value['id']),
    label,
    supportingText: coerceTrimmedStringInput(value['supportingText']),
    badge: coerceTrimmedStringInput(value['badge']),
    disabled: coerceOptionalBooleanInput(value['disabled']),
  }) as ListItem;
}

function sanitizeListItems(value: unknown): readonly ListItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((entry) => sanitizeListItem(entry))
    .filter((entry): entry is ListItem => entry !== undefined);

  return items.length > 0 ? items : undefined;
}

function sanitizeListConfig(value: Partial<ListConfig>): Partial<ListConfig> {
  return omitUndefinedProperties<ListConfig>({
    items: sanitizeListItems(value.items),
    ordered: coerceOptionalBooleanInput(value.ordered),
    marker: coerceStringEnumInput(value.marker, ['disc', 'check', 'none'] as const),
    density: coerceStringEnumInput(value.density, ['comfortable', 'compact'] as const),
    divided: coerceOptionalBooleanInput(value.divided),
    interactive: coerceOptionalBooleanInput(value.interactive),
  });
}

@Component({
  selector: 'syn-list',
  standalone: true,
  imports: [BadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ordered()) {
      <ol class="syn-list" [class]="listClass()">
        @for (item of items(); track trackBy(item, $index); let index = $index) {
          <li class="syn-list__item" [class]="itemClass(item)">
            <div
              class="syn-list__row"
              [attr.tabindex]="interactive() && !item.disabled ? 0 : null"
              [attr.role]="interactive() ? 'button' : null"
              [attr.aria-disabled]="item.disabled ? 'true' : null"
              (click)="select(item)"
              (keydown.enter)="select(item)"
              (keydown.space)="onSpaceKeydown($event, item)"
            >
              @if (marker() !== 'none') {
                <span class="syn-list__marker" aria-hidden="true">{{ markerLabel(index) }}</span>
              }

              <div class="syn-list__copy">
                <span class="syn-list__label">{{ item.label }}</span>

                @if (item.supportingText) {
                  <span class="syn-list__supporting">{{ item.supportingText }}</span>
                }
              </div>

              @if (item.badge) {
                <syn-badge [text]="item.badge" />
              }
            </div>
          </li>
        }
      </ol>
    } @else {
      <ul class="syn-list" [class]="listClass()">
        @for (item of items(); track trackBy(item, $index); let index = $index) {
          <li class="syn-list__item" [class]="itemClass(item)">
            <div
              class="syn-list__row"
              [attr.tabindex]="interactive() && !item.disabled ? 0 : null"
              [attr.role]="interactive() ? 'button' : null"
              [attr.aria-disabled]="item.disabled ? 'true' : null"
              (click)="select(item)"
              (keydown.enter)="select(item)"
              (keydown.space)="onSpaceKeydown($event, item)"
            >
              @if (marker() !== 'none') {
                <span class="syn-list__marker" aria-hidden="true">{{ markerLabel(index) }}</span>
              }

              <div class="syn-list__copy">
                <span class="syn-list__label">{{ item.label }}</span>

                @if (item.supportingText) {
                  <span class="syn-list__supporting">{{ item.supportingText }}</span>
                }
              </div>

              @if (item.badge) {
                <syn-badge [text]="item.badge" />
              }
            </div>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './list.scss',
})
export class ListComponent {
  readonly config = input<Partial<ListConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ListConfig>(sanitizeListConfig),
  });
  readonly itemsInput = input<readonly ListItem[] | undefined>(undefined, { alias: 'items' });
  readonly orderedInput = input<boolean | undefined>(undefined, { alias: 'ordered' });
  readonly markerInput = input<ListMarker | undefined>(undefined, { alias: 'marker' });
  readonly densityInput = input<ListDensity | undefined>(undefined, { alias: 'density' });
  readonly dividedInput = input<boolean | undefined>(undefined, { alias: 'divided' });
  readonly interactiveInput = input<boolean | undefined>(undefined, { alias: 'interactive' });

  readonly items = computed(() =>
    resolveConfigArray(this.itemsInput(), this.config()?.items),
  );
  readonly ordered = computed(() =>
    resolveConfigValue(this.orderedInput(), this.config()?.ordered, false),
  );
  readonly marker = computed(() =>
    resolveConfigValue(this.markerInput(), this.config()?.marker, 'disc'),
  );
  readonly density = computed(() =>
    resolveConfigValue(this.densityInput(), this.config()?.density, 'comfortable'),
  );
  readonly divided = computed(() =>
    resolveConfigValue(this.dividedInput(), this.config()?.divided, true),
  );
  readonly interactive = computed(() =>
    resolveConfigValue(this.interactiveInput(), this.config()?.interactive, false),
  );

  readonly itemSelected = output<ListItem>();

  listClass(): string {
    return classNames(
      'syn-list',
      `syn-list--${this.density()}`,
      `syn-list--marker-${this.marker()}`,
      this.divided() && 'syn-list--divided',
      this.interactive() && 'syn-list--interactive',
    );
  }

  itemClass(item: ListItem): string {
    return classNames('syn-list__item', item.disabled && 'syn-list__item--disabled');
  }

  markerLabel(index: number): string {
    if (this.ordered()) {
      return `${index + 1}.`;
    }

    return this.marker() === 'check' ? 'OK' : '\u2022';
  }

  onSpaceKeydown(event: Event, item: ListItem): void {
    event.preventDefault();
    this.select(item);
  }

  select(item: ListItem): void {
    if (!this.interactive() || item.disabled) {
      return;
    }

    this.itemSelected.emit(item);
  }

  trackBy(item: ListItem, index: number): string {
    return item.id ?? `${item.label}-${index}`;
  }
}

