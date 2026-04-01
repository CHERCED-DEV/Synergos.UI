import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';

export type DescriptionListEmphasis = 'default' | 'muted' | 'brand';
export type DescriptionListLayout = 'stacked' | 'inline';

export interface DescriptionListItem {
  readonly id?: string;
  readonly term: string;
  readonly description: string;
  readonly detail?: string;
  readonly emphasis?: DescriptionListEmphasis;
}

@Component({
  selector: 'syn-description-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="syn-description-list" [class]="listClass()">
      @for (item of items(); track trackBy(item, $index)) {
        <div class="syn-description-list__row">
          <dt class="syn-description-list__term">{{ item.term }}</dt>
          <dd class="syn-description-list__value" [class]="valueClass(item)">
            <span>{{ item.description }}</span>

            @if (item.detail) {
              <span class="syn-description-list__detail">{{ item.detail }}</span>
            }
          </dd>
        </div>
      }
    </dl>
  `,
  styleUrl: './description-list.scss',
})
export class DescriptionListComponent {
  readonly items = input<readonly DescriptionListItem[]>([]);
  readonly layout = input<DescriptionListLayout>('stacked');
  readonly separated = input(true);

  readonly listClass = computed(() =>
    classNames(
      'syn-description-list',
      `syn-description-list--${this.layout()}`,
      this.separated() && 'syn-description-list--separated',
    ),
  );

  valueClass(item: DescriptionListItem): string {
    return classNames(
      'syn-description-list__value',
      item.emphasis && `syn-description-list__value--${item.emphasis}`,
    );
  }

  trackBy(item: DescriptionListItem, index: number): string {
    return item.id ?? `${item.term}-${index}`;
  }
}
