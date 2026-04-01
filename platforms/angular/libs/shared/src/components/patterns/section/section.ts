import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LiveAnnouncerService } from '../../../services/live-announcer.service';
import { classNames } from '../../../utils/class-names.util';
import { VisuallyHiddenComponent } from '../../primitives/visually-hidden/visually-hidden';

type SectionPadding = 'sm' | 'md' | 'lg';

let sectionId = 0;

@Component({
  selector: 'syn-section',
  standalone: true,
  imports: [VisuallyHiddenComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="syn-section"
      [class]="sectionClass()"
      role="region"
      [attr.aria-labelledby]="title() ? titleId : null"
      [attr.aria-label]="title() ? null : ariaLabel() || null"
    >
      <header class="syn-section__header">
        <div class="syn-section__heading">
          @if (eyebrow()) {
            <p class="syn-section__eyebrow">{{ eyebrow() }}</p>
          }

          @if (title()) {
            <h2 class="syn-section__title" [id]="titleId">{{ title() }}</h2>
          }

          @if (subtitle()) {
            <p class="syn-section__subtitle">{{ subtitle() }}</p>
          }
        </div>

        <div class="syn-section__actions">
          <ng-content select="[slot=actions]" />

          @if (collapsible()) {
            <button
              type="button"
              class="syn-section__toggle"
              [attr.aria-expanded]="!collapsed()"
              [attr.aria-controls]="contentId"
              (click)="toggleCollapsed()"
            >
              <span aria-hidden="true">{{ collapsed() ? '+' : '-' }}</span>
              <syn-visually-hidden>
                {{ collapsed() ? expandLabel() : collapseLabel() }}
              </syn-visually-hidden>
            </button>
          }
        </div>
      </header>

      @if (divider()) {
        <div class="syn-section__divider"></div>
      }

      @if (!collapsed()) {
        <div class="syn-section__body" [id]="contentId">
          <ng-content />
        </div>
      }

      <footer class="syn-section__footer">
        <ng-content select="[slot=footer]" />
      </footer>
    </section>
  `,
  styleUrl: './section.scss',
})
export class SectionComponent implements OnInit {
  readonly #announcer = inject(LiveAnnouncerService);
  readonly #collapsed = signal(false);

  readonly title = input('');
  readonly subtitle = input('');
  readonly eyebrow = input('');
  readonly ariaLabel = input('');
  readonly collapsible = input(false);
  readonly defaultCollapsed = input(false);
  readonly collapseLabel = input('Collapse section');
  readonly expandLabel = input('Expand section');
  readonly divider = input(true);
  readonly padding = input<SectionPadding>('md');

  readonly collapsed = this.#collapsed.asReadonly();
  readonly collapsedChange = output<boolean>();

  readonly titleId = `syn-section-title-${sectionId}`;
  readonly contentId = `syn-section-content-${sectionId}`;

  readonly sectionClass = computed(() =>
    classNames(
      'syn-section',
      `syn-section--padding-${this.padding()}`,
      this.collapsible() && 'syn-section--collapsible',
      this.collapsed() && 'syn-section--collapsed',
    ),
  );

  constructor() {
    sectionId += 1;
  }

  ngOnInit(): void {
    this.#collapsed.set(this.defaultCollapsed());
  }

  toggleCollapsed(): void {
    const nextState = !this.#collapsed();
    this.#collapsed.set(nextState);
    this.#announcer.announce(nextState ? 'Section collapsed' : 'Section expanded');
    this.collapsedChange.emit(nextState);
  }
}
