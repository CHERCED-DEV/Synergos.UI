import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import { ButtonComponent } from '../../primitives/button/button';
import { HeadingComponent } from '../../primitives/heading/heading';
import { RangeSliderComponent } from '../../primitives/range-slider/range-slider';
import { SelectComponent } from '../../primitives/select/select';
import { StatusTagComponent } from '../../primitives/status-tag/status-tag';
import { AccordionComponent } from '../../compositions/accordion/accordion';
import {
  OptionListComponent,
  type OptionListItem,
} from '../../compositions/option-list/option-list';

export type FilterPanelCommitMode = 'manual' | 'immediate';
export type FilterPanelValue = number | null | readonly string[];

export interface FilterPanelOption {
  readonly id?: string;
  readonly value?: string;
  readonly label: string;
  readonly description?: string;
  readonly count?: number;
  readonly disabled?: boolean;
  readonly selected?: boolean;
}

export interface FilterPanelRangeConfig {
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly value?: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly showValue?: boolean;
}

interface FilterPanelSectionBase {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly initiallyExpanded?: boolean;
}

export interface FilterPanelSingleSection extends FilterPanelSectionBase {
  readonly type: 'single';
  readonly options: readonly FilterPanelOption[];
}

export interface FilterPanelMultipleSection extends FilterPanelSectionBase {
  readonly type: 'multiple';
  readonly options: readonly FilterPanelOption[];
}

export interface FilterPanelRangeSection extends FilterPanelSectionBase {
  readonly type: 'range';
  readonly range: FilterPanelRangeConfig;
}

export type FilterPanelSection =
  | FilterPanelMultipleSection
  | FilterPanelRangeSection
  | FilterPanelSingleSection;

export interface FilterPanelSortOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface FilterPanelState {
  readonly sort: string;
  readonly values: Readonly<Record<string, FilterPanelValue>>;
}

@Component({
  selector: 'syn-filter-panel',
  standalone: true,
  imports: [
    AccordionComponent,
    ButtonComponent,
    HeadingComponent,
    OptionListComponent,
    RangeSliderComponent,
    SelectComponent,
    StatusTagComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="syn-filter-panel"
      [class]="panelClass()"
      [attr.aria-label]="ariaLabel() || title() || 'Filters'"
    >
      @if (title() || description() || activeFilterCount() > 0) {
        <header class="syn-filter-panel__header">
          <div class="syn-filter-panel__copy">
            <syn-heading
              [text]="title()"
              [supportingText]="description()"
              level="h3"
              size="md"
            />
          </div>

          @if (activeFilterCount() > 0) {
            <syn-status-tag
              [label]="activeCountLabel()"
              tone="pending"
              style="filled"
            />
          }
        </header>
      }

      @if (sortOptions().length > 0) {
        <div class="syn-filter-panel__sort">
          <syn-select
            [label]="sortLabel()"
            [value]="state().sort"
            [options]="resolvedSortOptions()"
            (valueChange)="updateSort($event)"
          />
        </div>
      }

      <div class="syn-filter-panel__sections">
        @for (section of sections(); track section.id) {
          <syn-accordion
            [id]="section.id"
            [title]="section.title"
            [description]="section.description ?? ''"
            [disabled]="section.disabled ?? false"
            [initiallyExpanded]="section.initiallyExpanded ?? true"
          >
            @if (section.type === 'range') {
              <div class="syn-filter-panel__range">
                <syn-range-slider
                  [label]="section.title"
                  [min]="section.range.min"
                  [max]="section.range.max"
                  [step]="section.range.step ?? 1"
                  [value]="rangeValue(section)"
                  [showValue]="section.range.showValue ?? true"
                  (valueChange)="updateRange(section, $event)"
                  (valueCommitted)="commitRange(section, $event)"
                />

                @if (rangeCaption(section)) {
                  <p class="syn-filter-panel__range-caption">{{ rangeCaption(section) }}</p>
                }
              </div>
            } @else {
              <syn-option-list
                [layout]="optionLayout()"
                [selectionMode]="section.type === 'single' ? 'single' : 'multiple'"
                [items]="optionItems(section)"
                [selectedIds]="selectedIds(section.id)"
                [ariaLabel]="section.title"
                (selectionChange)="updateOptions(section, $event)"
              />
            }
          </syn-accordion>
        }
      </div>

      @if (commitMode() === 'manual') {
        <div class="syn-filter-panel__actions">
          <syn-button variant="ghost" [label]="clearLabel()" (pressed)="clearAll()" />
          <syn-button [label]="applyLabel()" (pressed)="apply()" />
        </div>
      }
    </section>
  `,
  styleUrl: './filter-panel.scss',
})
export class FilterPanelComponent {
  readonly title = input('Filters');
  readonly description = input('');
  readonly ariaLabel = input('');
  readonly sections = input<readonly FilterPanelSection[]>([]);
  readonly sortLabel = input('Sort by');
  readonly sortOptions = input<readonly FilterPanelSortOption[]>([]);
  readonly sortValue = input('');
  readonly clearLabel = input('Clear');
  readonly applyLabel = input('Apply');
  readonly optionLayout = input<'list' | 'cards'>('list');
  readonly commitMode = input<FilterPanelCommitMode>('manual');

  readonly #state = linkedSignal<FilterPanelState>(() => ({
    sort: this.sortValue(),
    values: this.createInitialValues(),
  }));

  readonly stateChange = output<FilterPanelState>();
  readonly sortChanged = output<string>();
  readonly applied = output<FilterPanelState>();
  readonly cleared = output<FilterPanelState>();

  readonly state = this.#state.asReadonly();
  readonly activeFilterCount = computed(() =>
    this.sections().filter((section) => this.isSectionActive(section, this.state().values[section.id])).length,
  );
  readonly panelClass = computed(() => classNames('syn-filter-panel'));

  resolvedSortOptions(): readonly { value: string; label: string; disabled?: boolean }[] {
    return this.sortOptions().map((option) => ({
      value: option.value,
      label: option.label,
      disabled: option.disabled,
    }));
  }

  optionItems(
    section: FilterPanelSingleSection | FilterPanelMultipleSection,
  ): readonly OptionListItem[] {
    return section.options.map((option, index) => ({
      id: this.optionId(option, index),
      label: option.count === undefined ? option.label : `${option.label} (${option.count})`,
      description: option.description,
      disabled: option.disabled,
    }));
  }

  selectedIds(sectionId: string): readonly string[] {
    const value = this.state().values[sectionId];
    return Array.isArray(value) ? value : [];
  }

  rangeValue(section: FilterPanelRangeSection): number {
    const value = this.state().values[section.id];
    if (typeof value === 'number') {
      return value;
    }

    return section.range.value ?? section.range.max;
  }

  rangeCaption(section: FilterPanelRangeSection): string {
    const value = this.rangeValue(section);
    const prefix = section.range.prefix ?? '';
    const suffix = section.range.suffix ?? '';
    if (!prefix && !suffix) {
      return '';
    }

    return `${prefix}${value}${suffix}`;
  }

  activeCountLabel(): string {
    const count = this.activeFilterCount();
    return count === 1 ? '1 active filter' : `${count} active filters`;
  }

  updateSort(value: string): void {
    const nextState: FilterPanelState = {
      sort: value,
      values: { ...this.state().values },
    };

    this.#state.set(nextState);
    this.stateChange.emit(this.cloneState(nextState));
    this.sortChanged.emit(value);
    this.emitAppliedIfNeeded(nextState);
  }

  updateOptions(
    section: FilterPanelSingleSection | FilterPanelMultipleSection,
    selectedIds: readonly string[],
  ): void {
    const nextState = this.patchSectionValue(section.id, [...selectedIds]);
    this.stateChange.emit(this.cloneState(nextState));
    this.emitAppliedIfNeeded(nextState);
  }

  updateRange(section: FilterPanelRangeSection, value: number): void {
    const nextState = this.patchSectionValue(section.id, value);
    this.stateChange.emit(this.cloneState(nextState));
  }

  commitRange(section: FilterPanelRangeSection, value: number): void {
    const nextState = this.patchSectionValue(section.id, value);
    this.stateChange.emit(this.cloneState(nextState));
    this.emitAppliedIfNeeded(nextState);
  }

  clearAll(): void {
    const nextState: FilterPanelState = {
      sort: this.state().sort,
      values: this.createClearedValues(),
    };

    this.#state.set(nextState);
    this.stateChange.emit(this.cloneState(nextState));
    this.cleared.emit(this.cloneState(nextState));
    this.emitAppliedIfNeeded(nextState);
  }

  apply(): void {
    this.applied.emit(this.cloneState(this.state()));
  }

  private createInitialValues(): Record<string, FilterPanelValue> {
    const values: Record<string, FilterPanelValue> = {};

    for (const section of this.sections()) {
      if (section.type === 'range') {
        values[section.id] = section.range.value ?? section.range.max;
        continue;
      }

      values[section.id] = section.options
        .map((option, index) => ({
          id: this.optionId(option, index),
          selected: option.selected === true,
        }))
        .filter((option) => option.selected)
        .map((option) => option.id);
    }

    return values;
  }

  private createClearedValues(): Record<string, FilterPanelValue> {
    const values: Record<string, FilterPanelValue> = {};

    for (const section of this.sections()) {
      values[section.id] =
        section.type === 'range'
          ? section.range.value ?? section.range.max
          : [];
    }

    return values;
  }

  private patchSectionValue(sectionId: string, value: FilterPanelValue): FilterPanelState {
    const nextState: FilterPanelState = {
      sort: this.state().sort,
      values: {
        ...this.state().values,
        [sectionId]: value,
      },
    };

    this.#state.set(nextState);
    return nextState;
  }

  private optionId(option: FilterPanelOption, index: number): string {
    return option.id ?? option.value ?? `filter-option-${index}`;
  }

  private isSectionActive(section: FilterPanelSection, value: FilterPanelValue | undefined): boolean {
    if (section.type === 'range') {
      return typeof value === 'number' && value !== (section.range.value ?? section.range.max);
    }

    return Array.isArray(value) && value.length > 0;
  }

  private emitAppliedIfNeeded(state: FilterPanelState): void {
    if (this.commitMode() !== 'immediate') {
      return;
    }

    this.applied.emit(this.cloneState(state));
  }

  private cloneState(state: FilterPanelState): FilterPanelState {
    const clonedValues: Record<string, FilterPanelValue> = {};

    for (const [key, value] of Object.entries(state.values)) {
      clonedValues[key] = Array.isArray(value) ? [...value] : value;
    }

    return {
      sort: state.sort,
      values: clonedValues,
    };
  }
}
