import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { BadgeComponent } from '../badge/badge';
import { classNames } from '../../../utils/class-names.util';

export type ListDensity = 'comfortable' | 'compact';
export type ListMarker = 'disc' | 'check' | 'none';

export interface ListItem {
  readonly id?: string;
  readonly label: string;
  readonly supportingText?: string;
  readonly badge?: string;
  readonly disabled?: boolean;
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
  readonly items = input<readonly ListItem[]>([]);
  readonly ordered = input(false);
  readonly marker = input<ListMarker>('disc');
  readonly density = input<ListDensity>('comfortable');
  readonly divided = input(true);
  readonly interactive = input(false);

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
