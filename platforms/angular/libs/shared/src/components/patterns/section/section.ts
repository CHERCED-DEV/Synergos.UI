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
import {
  coerceOptionalBooleanInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '../../../utils/config-input.util';
import { VisuallyHiddenComponent } from '../../primitives/visually-hidden/visually-hidden';

type SectionPadding = 'sm' | 'md' | 'lg';

export interface SectionConfig {
  readonly title?: string;
  readonly subtitle?: string;
  readonly eyebrow?: string;
  readonly ariaLabel?: string;
  readonly collapsible?: boolean;
  readonly defaultCollapsed?: boolean;
  readonly collapseLabel?: string;
  readonly expandLabel?: string;
  readonly divider?: boolean;
  readonly padding?: SectionPadding;
}

function sanitizeSectionConfig(value: Partial<SectionConfig>): Partial<SectionConfig> {
  return omitUndefinedProperties<SectionConfig>({
    title: coerceTrimmedStringInput(value.title),
    subtitle: coerceTrimmedStringInput(value.subtitle),
    eyebrow: coerceTrimmedStringInput(value.eyebrow),
    ariaLabel: coerceTrimmedStringInput(value.ariaLabel),
    collapsible: coerceOptionalBooleanInput(value.collapsible),
    defaultCollapsed: coerceOptionalBooleanInput(value.defaultCollapsed),
    collapseLabel: coerceTrimmedStringInput(value.collapseLabel),
    expandLabel: coerceTrimmedStringInput(value.expandLabel),
    divider: coerceOptionalBooleanInput(value.divider),
    padding: coerceStringEnumInput(value.padding, ['sm', 'md', 'lg'] as const),
  });
}

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

  readonly config = input<Partial<SectionConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SectionConfig>(sanitizeSectionConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly subtitleInput = input<string | undefined>(undefined, { alias: 'subtitle' });
  readonly eyebrowInput = input<string | undefined>(undefined, { alias: 'eyebrow' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly collapsibleInput = input<boolean | undefined>(undefined, { alias: 'collapsible' });
  readonly defaultCollapsedInput = input<boolean | undefined>(undefined, {
    alias: 'defaultCollapsed',
  });
  readonly collapseLabelInput = input<string | undefined>(undefined, {
    alias: 'collapseLabel',
  });
  readonly expandLabelInput = input<string | undefined>(undefined, { alias: 'expandLabel' });
  readonly dividerInput = input<boolean | undefined>(undefined, { alias: 'divider' });
  readonly paddingInput = input<SectionPadding | undefined>(undefined, { alias: 'padding' });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly subtitle = computed(() =>
    resolveConfigValue(this.subtitleInput(), this.config()?.subtitle, ''),
  );
  readonly eyebrow = computed(() =>
    resolveConfigValue(this.eyebrowInput(), this.config()?.eyebrow, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.config()?.ariaLabel, ''),
  );
  readonly collapsible = computed(() =>
    resolveConfigValue(this.collapsibleInput(), this.config()?.collapsible, false),
  );
  readonly defaultCollapsed = computed(() =>
    resolveConfigValue(
      this.defaultCollapsedInput(),
      this.config()?.defaultCollapsed,
      false,
    ),
  );
  readonly collapseLabel = computed(() =>
    resolveConfigValue(
      this.collapseLabelInput(),
      this.config()?.collapseLabel,
      'Collapse section',
    ),
  );
  readonly expandLabel = computed(() =>
    resolveConfigValue(
      this.expandLabelInput(),
      this.config()?.expandLabel,
      'Expand section',
    ),
  );
  readonly divider = computed(() =>
    resolveConfigValue(this.dividerInput(), this.config()?.divider, true),
  );
  readonly padding = computed(() =>
    resolveConfigValue(this.paddingInput(), this.config()?.padding, 'md'),
  );

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
