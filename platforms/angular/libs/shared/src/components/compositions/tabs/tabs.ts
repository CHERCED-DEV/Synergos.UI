import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: string;
  readonly disabled?: boolean;
}

export type TabsOrientation = 'horizontal' | 'vertical';

let tabsInstanceSequence = 0;

function nextTabsInstanceId(): string {
  tabsInstanceSequence += 1;
  return `syn-tabs-${tabsInstanceSequence}`;
}

@Component({
  selector: 'syn-tabs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-tabs">
      <div class="syn-tabs__scroll" [attr.data-orientation]="orientation()">
        <div
          class="syn-tabs__list"
          role="tablist"
          [attr.aria-label]="ariaLabel()"
          [attr.aria-orientation]="orientation()"
        >
          @for (tab of tabs(); track tab.id; let index = $index) {
            <button
              #tabButton
              type="button"
              class="syn-tabs__tab"
              role="tab"
              [id]="tabButtonId(tab.id)"
              [attr.aria-controls]="tabPanelId(tab.id)"
              [attr.aria-selected]="activeTabId() === tab.id"
              [attr.tabindex]="activeTabId() === tab.id ? 0 : -1"
              [disabled]="tab.disabled ?? false"
              (click)="select(tab.id)"
              (keydown)="onKeydown($event, index)"
            >
              {{ tab.label }}
            </button>
          }
        </div>
      </div>

      @if (activeTab(); as tab) {
        <section
          class="syn-tabs__panel"
          role="tabpanel"
          [id]="tabPanelId(tab.id)"
          [attr.aria-labelledby]="tabButtonId(tab.id)"
          tabindex="0"
        >
          {{ tab.content }}
        </section>
      }
    </div>
  `,
  styleUrl: './tabs.scss',
})
export class TabsComponent {
  readonly tabs = input<readonly TabItem[]>([]);
  readonly activeId = input('');
  readonly ariaLabel = input('Tabs');
  readonly orientation = input<TabsOrientation>('horizontal');

  /** Rendered tab buttons, in DOM (and `tabs()`) order — used for roving focus. */
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  readonly #instanceId = nextTabsInstanceId();
  readonly #selectedId = signal('');

  readonly activeTabId = computed(() => {
    if (this.#selectedId()) {
      return this.#selectedId();
    }

    if (this.activeId()) {
      return this.activeId();
    }

    const firstEnabled = this.tabs().find((tab) => !tab.disabled);
    return firstEnabled?.id ?? '';
  });

  readonly activeTab = computed(() =>
    this.tabs().find((tab) => tab.id === this.activeTabId()) ?? null,
  );

  readonly activeIdChange = output<string>();

  select(id: string): void {
    const tab = this.tabs().find((item) => item.id === id);
    if (!tab || tab.disabled) {
      return;
    }

    this.#selectedId.set(id);
    this.activeIdChange.emit(id);
  }

  onKeydown(event: KeyboardEvent, currentIndex: number): void {
    if (this.tabs().length === 0) {
      return;
    }

    const vertical = this.orientation() === 'vertical';
    const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
    const previousKey = vertical ? 'ArrowUp' : 'ArrowLeft';

    switch (event.key) {
      case nextKey:
        event.preventDefault();
        this.#moveTo(this.#neighborIndex(currentIndex, 1));
        return;
      case previousKey:
        event.preventDefault();
        this.#moveTo(this.#neighborIndex(currentIndex, -1));
        return;
      case 'Home':
        event.preventDefault();
        this.#moveTo(this.#edgeIndex(1));
        return;
      case 'End':
        event.preventDefault();
        this.#moveTo(this.#edgeIndex(-1));
        return;
      default:
        return;
    }
  }

  /**
   * Next enabled tab index in `direction`, wrapping around and skipping
   * disabled tabs. Starting from a disabled tab still lands on the nearest
   * enabled neighbour in that direction.
   */
  #neighborIndex(from: number, direction: 1 | -1): number {
    const tabs = this.tabs();
    const count = tabs.length;
    for (let step = 1; step <= count; step += 1) {
      const index = (((from + direction * step) % count) + count) % count;
      if (!tabs[index]?.disabled) {
        return index;
      }
    }
    return -1;
  }

  /** First (direction 1) or last (direction -1) enabled tab index. */
  #edgeIndex(direction: 1 | -1): number {
    const tabs = this.tabs();
    if (direction === 1) {
      return tabs.findIndex((tab) => !tab.disabled);
    }
    for (let index = tabs.length - 1; index >= 0; index -= 1) {
      if (!tabs[index]?.disabled) {
        return index;
      }
    }
    return -1;
  }

  /** Activate the tab at `index` (automatic mode) and move keyboard focus to it. */
  #moveTo(index: number): void {
    if (index < 0) {
      return;
    }

    const tab = this.tabs()[index];
    if (!tab || tab.disabled) {
      return;
    }

    this.select(tab.id);
    this.#focusTab(index);
  }

  #focusTab(index: number): void {
    const button = this.tabButtons()[index]?.nativeElement;
    if (!button) {
      return;
    }

    button.focus();
    button.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  tabButtonId(id: string): string {
    return `${this.#instanceId}-tab-${id}`;
  }

  tabPanelId(id: string): string {
    return `${this.#instanceId}-panel-${id}`;
  }
}
