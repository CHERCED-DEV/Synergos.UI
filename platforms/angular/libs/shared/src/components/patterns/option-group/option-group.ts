import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import { BadgeComponent } from '../../primitives/badge/badge';
import { IconComponent } from '../../primitives/icon/icon';
import { LinkComponent } from '../../primitives/link/link';
import {
  StatusTagComponent,
  type StatusTagTone,
} from '../../primitives/status-tag/status-tag';
import { GridColumnsComponent } from '../grid-columns/grid-columns';
import { SectionComponent } from '../section/section';

export type OptionGroupVariant = 'links' | 'cards' | 'buttons';
export type OptionGroupAlign = 'start' | 'center';
export type OptionGroupPadding = 'sm' | 'md' | 'lg';

export interface OptionGroupItem {
  readonly id?: string;
  readonly title: string;
  readonly description?: string;
  readonly supportingText?: string;
  readonly href?: string;
  readonly target?: string;
  readonly rel?: string;
  readonly iconSymbol?: string;
  readonly badge?: string;
  readonly statusLabel?: string;
  readonly statusTone?: StatusTagTone;
  readonly disabled?: boolean;
  readonly selected?: boolean;
}

@Component({
  selector: 'syn-option-group',
  standalone: true,
  imports: [
    BadgeComponent,
    GridColumnsComponent,
    IconComponent,
    LinkComponent,
    SectionComponent,
    StatusTagComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-option-group" [class]="groupClass()">
      <syn-section
        class="syn-option-group__section"
        [title]="title()"
        [subtitle]="description()"
        [collapsible]="collapsible()"
        [defaultCollapsed]="defaultCollapsed()"
        [divider]="divider()"
        [padding]="padding()"
        (collapsedChange)="collapsedChange.emit($event)"
      >
        <syn-grid-columns
          [columns]="columns()"
          [autoFit]="autoFit()"
          [gap]="gap()"
          [minColumnWidth]="minColumnWidth()"
        >
          @for (item of items(); track trackItem(item, $index)) {
            @if (variant() === 'links') {
              <article class="syn-option-group__entry" [class]="entryClass(item)">
                <div class="syn-option-group__entry-copy">
                  <div class="syn-option-group__entry-copy-main">
                    @if (item.iconSymbol) {
                      <syn-icon [symbol]="item.iconSymbol" tone="brand" />
                    }

                    <div class="syn-option-group__entry-text">
                      <h3 class="syn-option-group__entry-title">{{ item.title }}</h3>

                      @if (item.description) {
                        <p class="syn-option-group__entry-description">{{ item.description }}</p>
                      }
                    </div>
                  </div>

                  <div class="syn-option-group__entry-meta">
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

                <syn-link
                  [label]="item.supportingText || item.title"
                  [href]="item.href || ''"
                  [target]="item.target || ''"
                  [rel]="resolvedRel(item)"
                  [disabled]="item.disabled ?? false"
                  (activated)="itemActivated.emit(item)"
                />
              </article>
            } @else if (item.href && !(item.disabled ?? false)) {
              <a
                class="syn-option-group__entry syn-option-group__entry--action"
                [class]="entryClass(item)"
                [href]="item.href"
                [target]="item.target || null"
                [rel]="resolvedRel(item) || null"
                [attr.aria-label]="item.title"
                (click)="itemActivated.emit(item)"
              >
                <div class="syn-option-group__entry-copy">
                  <div class="syn-option-group__entry-copy-main">
                    @if (item.iconSymbol) {
                      <syn-icon [symbol]="item.iconSymbol" tone="brand" />
                    }

                    <div class="syn-option-group__entry-text">
                      <h3 class="syn-option-group__entry-title">{{ item.title }}</h3>

                      @if (item.description) {
                        <p class="syn-option-group__entry-description">{{ item.description }}</p>
                      }
                    </div>
                  </div>

                  <div class="syn-option-group__entry-meta">
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

                  @if (item.supportingText) {
                    <p class="syn-option-group__entry-supporting">{{ item.supportingText }}</p>
                  }
                </div>
              </a>
            } @else {
              <button
                type="button"
                class="syn-option-group__entry syn-option-group__entry--action"
                [class]="entryClass(item)"
                [disabled]="item.disabled ?? false"
                [attr.aria-label]="item.title"
                (click)="itemActivated.emit(item)"
              >
                <div class="syn-option-group__entry-copy">
                  <div class="syn-option-group__entry-copy-main">
                    @if (item.iconSymbol) {
                      <syn-icon [symbol]="item.iconSymbol" tone="brand" />
                    }

                    <div class="syn-option-group__entry-text">
                      <h3 class="syn-option-group__entry-title">{{ item.title }}</h3>

                      @if (item.description) {
                        <p class="syn-option-group__entry-description">{{ item.description }}</p>
                      }
                    </div>
                  </div>

                  <div class="syn-option-group__entry-meta">
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

                  @if (item.supportingText) {
                    <p class="syn-option-group__entry-supporting">{{ item.supportingText }}</p>
                  }
                </div>
              </button>
            }
          }
        </syn-grid-columns>

        @if (footnote()) {
          <p slot="footer" class="syn-option-group__footnote">{{ footnote() }}</p>
        }
      </syn-section>
    </div>
  `,
  styleUrl: './option-group.scss',
})
export class OptionGroupComponent {
  readonly title = input('');
  readonly description = input('');
  readonly footnote = input('');
  readonly items = input<readonly OptionGroupItem[]>([]);
  readonly variant = input<OptionGroupVariant>('cards');
  readonly columns = input(3);
  readonly autoFit = input(true);
  readonly minColumnWidth = input('16rem');
  readonly gap = input<'sm' | 'md' | 'lg'>('md');
  readonly align = input<OptionGroupAlign>('start');
  readonly collapsible = input(false);
  readonly defaultCollapsed = input(false);
  readonly divider = input(false);
  readonly padding = input<OptionGroupPadding>('md');

  readonly itemActivated = output<OptionGroupItem>();
  readonly collapsedChange = output<boolean>();

  readonly groupClass = computed(() =>
    classNames(
      'syn-option-group',
      `syn-option-group--${this.variant()}`,
      `syn-option-group--${this.align()}`,
    ),
  );

  entryClass(item: OptionGroupItem): string {
    return classNames(
      'syn-option-group__entry',
      `syn-option-group__entry--${this.variant()}`,
      item.selected && 'syn-option-group__entry--selected',
      item.disabled && 'syn-option-group__entry--disabled',
    );
  }

  resolvedRel(item: OptionGroupItem): string {
    if (item.rel) {
      return item.rel;
    }

    return item.target === '_blank' ? 'noopener noreferrer' : '';
  }

  trackItem(item: OptionGroupItem, index: number): string {
    return item.id ?? `${item.title}-${index}`;
  }
}
