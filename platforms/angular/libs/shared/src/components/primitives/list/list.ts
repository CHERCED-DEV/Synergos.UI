import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BadgeComponent } from '../badge/badge';
import { classNames } from '../../../utils/class-names.util';
import {
  coerceConfigInput,
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
            <div class="syn-list__row" (click)="select(item, index)">
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
            <div class="syn-list__row" (click)="select(item, index)">
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
    transform: coerceConfigInput<ListConfig>,
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

    return this.marker() === 'check' ? 'OK' : '•';
  }

  select(item: ListItem, _index: number): void {
    if (!this.interactive() || item.disabled) {
      return;
    }

    this.itemSelected.emit(item);
  }

  trackBy(item: ListItem, index: number): string {
    return item.id ?? `${item.label}-${index}`;
  }
}
