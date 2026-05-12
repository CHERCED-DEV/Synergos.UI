import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: string;
  readonly disabled?: boolean;
}

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
      <div class="syn-tabs__list" role="tablist" [attr.aria-label]="ariaLabel()">
        @for (tab of tabs(); track tab.id; let index = $index) {
          <button
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
    const enabled = this.tabs().filter((tab) => !tab.disabled);
    if (enabled.length === 0) {
      return;
    }

    const currentId = this.tabs()[currentIndex]?.id;
    const activeEnabledIndex = enabled.findIndex((tab) => tab.id === currentId);

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const next = enabled[(activeEnabledIndex + 1) % enabled.length];
      if (next) {
        this.select(next.id);
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const previous = enabled[(activeEnabledIndex - 1 + enabled.length) % enabled.length];
      if (previous) {
        this.select(previous.id);
      }
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      const first = enabled[0];
      if (first) {
        this.select(first.id);
      }
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      const last = enabled[enabled.length - 1];
      if (last) {
        this.select(last.id);
      }
    }
  }

  tabButtonId(id: string): string {
    return `${this.#instanceId}-tab-${id}`;
  }

  tabPanelId(id: string): string {
    return `${this.#instanceId}-panel-${id}`;
  }
}
