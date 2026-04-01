import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import { AvatarComponent } from '../../primitives/avatar/avatar';
import { BadgeComponent } from '../../primitives/badge/badge';
import { ButtonComponent } from '../../primitives/button/button';
import { HeadingComponent } from '../../primitives/heading/heading';
import {
  StatusTagComponent,
  type StatusTagTone,
} from '../../primitives/status-tag/status-tag';
import { EmptyStateComponent } from '../empty-state/empty-state';

export type FormSummaryLayout = 'stacked' | 'inline' | 'avatar';

export interface FormSummaryItem {
  readonly id?: string;
  readonly title: string;
  readonly description?: string;
  readonly detail?: string;
  readonly avatarName?: string;
  readonly avatarSrc?: string;
  readonly badge?: string;
  readonly statusLabel?: string;
  readonly statusTone?: StatusTagTone;
  readonly editable?: boolean;
  readonly removable?: boolean;
}

@Component({
  selector: 'syn-form-summary',
  standalone: true,
  imports: [
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    HeadingComponent,
    StatusTagComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="syn-form-summary"
      [class]="summaryClass()"
      [attr.aria-label]="ariaLabel() || title() || emptyTitle()"
    >
      @if (title() || description()) {
        <header class="syn-form-summary__header">
          <syn-heading
            [text]="title()"
            [supportingText]="description()"
            level="h3"
            size="md"
          />
        </header>
      }

      @if (items().length === 0) {
        <syn-empty-state
          [title]="emptyTitle()"
          [description]="emptyDescription()"
          align="start"
        />
      } @else {
        <div class="syn-form-summary__list">
          @for (item of visibleItems(); track trackItem(item, $index)) {
            <article class="syn-form-summary__item" [class]="itemClass()">
              @if (layout() === 'avatar') {
                <div class="syn-form-summary__avatar">
                  <syn-avatar
                    [name]="item.avatarName || item.title"
                    [src]="item.avatarSrc || ''"
                    size="sm"
                  />
                </div>
              }

              <div class="syn-form-summary__content">
                <div class="syn-form-summary__copy">
                  <div class="syn-form-summary__copy-main">
                    <h4 class="syn-form-summary__title">{{ item.title }}</h4>

                    @if (item.description) {
                      <p class="syn-form-summary__description">{{ item.description }}</p>
                    }

                    @if (item.detail) {
                      <p class="syn-form-summary__detail">{{ item.detail }}</p>
                    }
                  </div>

                  <div class="syn-form-summary__meta">
                    @if (item.badge) {
                      <syn-badge [text]="item.badge" />
                    }

                    @if (item.statusLabel) {
                      <syn-status-tag
                        [label]="item.statusLabel"
                        [tone]="item.statusTone ?? 'neutral'"
                      />
                    }
                  </div>
                </div>

                @if (item.editable || item.removable) {
                  <div class="syn-form-summary__actions">
                    @if (item.editable) {
                      <syn-button
                        size="sm"
                        variant="ghost"
                        [label]="editLabel()"
                        (pressed)="itemEdited.emit(item)"
                      />
                    }

                    @if (item.removable) {
                      <syn-button
                        size="sm"
                        variant="ghost"
                        [label]="removeLabel()"
                        (pressed)="itemRemoved.emit(item)"
                      />
                    }
                  </div>
                }
              </div>
            </article>
          }
        </div>

        @if (remainingCount() > 0 || expanded()) {
          <div class="syn-form-summary__pagination">
            <syn-button
              size="sm"
              variant="ghost"
              [label]="expanded() ? showLessLabel() : showMoreText()"
              (pressed)="toggleExpanded()"
            />
          </div>
        }
      }
    </section>
  `,
  styleUrl: './form-summary.scss',
})
export class FormSummaryComponent {
  readonly title = input('');
  readonly description = input('');
  readonly ariaLabel = input('');
  readonly items = input<readonly FormSummaryItem[]>([]);
  readonly layout = input<FormSummaryLayout>('stacked');
  readonly maxVisible = input(3);
  readonly showMoreLabel = input('Show more');
  readonly showLessLabel = input('Show less');
  readonly editLabel = input('Edit');
  readonly removeLabel = input('Remove');
  readonly emptyTitle = input('Nothing to review yet');
  readonly emptyDescription = input('Add entries to see a summary here.');

  readonly #expanded = linkedSignal(() => false);

  readonly itemEdited = output<FormSummaryItem>();
  readonly itemRemoved = output<FormSummaryItem>();

  readonly expanded = this.#expanded.asReadonly();
  readonly remainingCount = computed(() => Math.max(this.items().length - this.maxVisible(), 0));
  readonly visibleItems = computed(() =>
    this.expanded() ? this.items() : this.items().slice(0, this.maxVisible()),
  );

  readonly summaryClass = computed(() =>
    classNames('syn-form-summary', `syn-form-summary--${this.layout()}`),
  );

  showMoreText(): string {
    if (this.remainingCount() === 0) {
      return this.showMoreLabel();
    }

    return `${this.showMoreLabel()} (${this.remainingCount()})`;
  }

  toggleExpanded(): void {
    this.#expanded.update((expanded) => !expanded);
  }

  itemClass(): string {
    return classNames('syn-form-summary__item', `syn-form-summary__item--${this.layout()}`);
  }

  trackItem(item: FormSummaryItem, index: number): string {
    return item.id ?? `${item.title}-${index}`;
  }
}
