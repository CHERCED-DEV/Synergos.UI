import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import { ButtonComponent } from '../../primitives/button/button';
import { HeadingComponent } from '../../primitives/heading/heading';
import {
  DescriptionListComponent,
  type DescriptionListItem,
} from '../../compositions/description-list/description-list';
import { EmptyStateComponent } from '../empty-state/empty-state';

export interface DetailSummarySection {
  readonly id?: string;
  readonly title: string;
  readonly description?: string;
  readonly entries: readonly DescriptionListItem[];
  readonly actionLabel?: string;
  readonly actionValue?: string;
}

export interface DetailSummaryAction {
  readonly sectionId: string;
  readonly actionValue: string;
}

@Component({
  selector: 'syn-detail-summary',
  standalone: true,
  imports: [ButtonComponent, DescriptionListComponent, EmptyStateComponent, HeadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="syn-detail-summary"
      [class]="summaryClass()"
      [attr.aria-label]="ariaLabel() || title() || emptyTitle()"
    >
      @if (title() || description()) {
        <header class="syn-detail-summary__header">
          <syn-heading
            [text]="title()"
            [supportingText]="description()"
            level="h3"
            size="md"
          />
        </header>
      }

      @if (sections().length === 0) {
        <syn-empty-state
          [title]="emptyTitle()"
          [description]="emptyDescription()"
          align="start"
        />
      } @else {
        <div class="syn-detail-summary__sections">
          @for (section of visibleSections(); track trackSection(section, $index)) {
            <article class="syn-detail-summary__section">
              <div class="syn-detail-summary__section-header">
                <div class="syn-detail-summary__section-copy">
                  <h4 class="syn-detail-summary__section-title">{{ section.title }}</h4>

                  @if (section.description) {
                    <p class="syn-detail-summary__section-description">
                      {{ section.description }}
                    </p>
                  }
                </div>

                @if (section.actionLabel) {
                  <syn-button
                    size="sm"
                    variant="ghost"
                    [label]="section.actionLabel"
                    (pressed)="emitSectionAction(section)"
                  />
                }
              </div>

              <syn-description-list [items]="section.entries" />
            </article>
          }
        </div>

        @if (remainingCount() > 0 || expanded()) {
          <div class="syn-detail-summary__pagination">
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
  styleUrl: './detail-summary.scss',
})
export class DetailSummaryComponent {
  readonly title = input('');
  readonly description = input('');
  readonly ariaLabel = input('');
  readonly sections = input<readonly DetailSummarySection[]>([]);
  readonly maxVisible = input(3);
  readonly showMoreLabel = input('Show more');
  readonly showLessLabel = input('Show less');
  readonly emptyTitle = input('No details available');
  readonly emptyDescription = input('Add content to build a structured summary.');

  readonly #expanded = linkedSignal(() => false);

  readonly sectionAction = output<DetailSummaryAction>();

  readonly expanded = this.#expanded.asReadonly();
  readonly remainingCount = computed(() =>
    Math.max(this.sections().length - this.maxVisible(), 0),
  );
  readonly visibleSections = computed(() =>
    this.expanded() ? this.sections() : this.sections().slice(0, this.maxVisible()),
  );
  readonly summaryClass = computed(() => classNames('syn-detail-summary'));

  showMoreText(): string {
    if (this.remainingCount() === 0) {
      return this.showMoreLabel();
    }

    return `${this.showMoreLabel()} (${this.remainingCount()})`;
  }

  toggleExpanded(): void {
    this.#expanded.update((expanded) => !expanded);
  }

  emitSectionAction(section: DetailSummarySection): void {
    this.sectionAction.emit({
      sectionId: section.id ?? section.title,
      actionValue: section.actionValue ?? section.actionLabel ?? '',
    });
  }

  trackSection(section: DetailSummarySection, index: number): string {
    return section.id ?? `${section.title}-${index}`;
  }
}
