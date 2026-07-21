import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';

type PaginatorItem = number | 'ellipsis-start' | 'ellipsis-end';

@Component({
  selector: 'syn-paginator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (totalPages() > 1) {
      <nav class="syn-paginator" [class]="paginatorClass()" [attr.aria-label]="ariaLabel()">
        <button
          type="button"
          class="syn-paginator__nav"
          [disabled]="activePage() === 1"
          (click)="previous()"
        >
          {{ previousLabel() }}
        </button>

        <ul class="syn-paginator__list">
          @for (item of pageItems(); track trackBy(item, $index)) {
            <li class="syn-paginator__item">
              @if (isPageNumber(item)) {
                <button
                  type="button"
                  class="syn-paginator__page"
                  [class.syn-paginator__page--active]="activePage() === item"
                  [attr.aria-current]="activePage() === item ? 'page' : null"
                  [attr.aria-label]="'Go to page ' + item"
                  (click)="select(item)"
                >
                  {{ item }}
                </button>
              } @else {
                <span class="syn-paginator__ellipsis" aria-hidden="true">...</span>
              }
            </li>
          }
        </ul>

        <button
          type="button"
          class="syn-paginator__nav"
          [disabled]="activePage() === safeTotalPages()"
          (click)="next()"
        >
          {{ nextLabel() }}
        </button>
      </nav>
    }
  `,
  styleUrl: './paginator.scss',
})
export class PaginatorComponent {
  readonly currentPage = input(1);
  readonly totalPages = input(1);
  readonly pagesToShow = input(5);
  readonly ariaLabel = input('Pagination');
  readonly previousLabel = input('Previous');
  readonly nextLabel = input('Next');
  readonly compact = input(false);

  readonly safeTotalPages = computed(() => Math.max(1, Math.floor(this.totalPages())));
  readonly safePagesToShow = computed(() => Math.max(3, Math.floor(this.pagesToShow())));
  readonly activePage = linkedSignal(() => this.normalizePage(this.currentPage()));

  readonly currentPageChange = output<number>();

  readonly paginatorClass = computed(() =>
    classNames('syn-paginator', this.compact() && 'syn-paginator--compact'),
  );

  readonly pageItems = computed(() => {
    const total = this.safeTotalPages();
    const visible = this.safePagesToShow();
    const current = this.activePage();

    if (total <= visible) {
      return Array.from({ length: total }, (_, index) => index + 1);
    }

    const half = Math.floor(visible / 2);
    let start = Math.max(1, current - half);
    const end = Math.min(total, start + visible - 1);

    if (end - start + 1 < visible) {
      start = Math.max(1, end - visible + 1);
    }

    const items: PaginatorItem[] = [];

    if (start > 1) {
      items.push(1);
    }

    if (start > 2) {
      items.push('ellipsis-start');
    }

    for (let page = start; page <= end; page += 1) {
      if (page !== 1 && page !== total) {
        items.push(page);
      }
    }

    if (end < total - 1) {
      items.push('ellipsis-end');
    }

    if (end < total) {
      items.push(total);
    }

    return items;
  });

  previous(): void {
    if (this.activePage() <= 1) {
      return;
    }

    this.select(this.activePage() - 1);
  }

  next(): void {
    if (this.activePage() >= this.safeTotalPages()) {
      return;
    }

    this.select(this.activePage() + 1);
  }

  select(page: number): void {
    const nextPage = this.normalizePage(page);
    this.activePage.set(nextPage);
    this.currentPageChange.emit(nextPage);
  }

  isPageNumber(item: PaginatorItem): item is number {
    return typeof item === 'number';
  }

  trackBy(item: PaginatorItem, index: number): string {
    return typeof item === 'number' ? `page-${item}` : `${item}-${index}`;
  }

  private normalizePage(page: number): number {
    return Math.min(Math.max(1, Math.floor(page)), this.safeTotalPages());
  }
}
