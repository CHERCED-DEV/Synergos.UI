import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import {
  coerceOptionalBooleanInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigArray,
  resolveConfigValue,
} from '../../../utils/config-input.util';
import { HeadingComponent } from '../../primitives/heading/heading';
import {
  StatusTagComponent,
  type StatusTagTone,
} from '../../primitives/status-tag/status-tag';
import {
  DescriptionListComponent,
  type DescriptionListItem,
  type DescriptionListLayout,
} from '../description-list/description-list';

export type OverviewCardTone = 'neutral' | 'brand';
export type OverviewCardLayout = 'stacked' | 'split';

export interface OverviewCardConfig {
  readonly title?: string;
  readonly subtitle?: string;
  readonly eyebrow?: string;
  readonly description?: string;
  readonly ariaLabel?: string;
  readonly tone?: OverviewCardTone;
  readonly layout?: OverviewCardLayout;
  readonly bordered?: boolean;
  readonly elevated?: boolean;
  readonly details?: readonly DescriptionListItem[];
  readonly detailsLayout?: DescriptionListLayout;
  readonly statusLabel?: string;
  readonly statusTone?: StatusTagTone;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeDescriptionListItem(value: unknown): DescriptionListItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const term = coerceTrimmedStringInput(value['term']);
  const description = coerceTrimmedStringInput(value['description']);
  if (!term || !description) {
    return undefined;
  }

  return omitUndefinedProperties<DescriptionListItem>({
    id: coerceTrimmedStringInput(value['id']),
    term,
    description,
    detail: coerceTrimmedStringInput(value['detail']),
    emphasis: coerceStringEnumInput(value['emphasis'], ['default', 'muted', 'brand'] as const),
  }) as DescriptionListItem;
}

function sanitizeDescriptionListItems(value: unknown): readonly DescriptionListItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((entry) => sanitizeDescriptionListItem(entry))
    .filter((entry): entry is DescriptionListItem => entry !== undefined);

  return items.length > 0 ? items : undefined;
}

function sanitizeOverviewCardConfig(
  value: Partial<OverviewCardConfig>,
): Partial<OverviewCardConfig> {
  return omitUndefinedProperties<OverviewCardConfig>({
    title: coerceTrimmedStringInput(value.title),
    subtitle: coerceTrimmedStringInput(value.subtitle),
    eyebrow: coerceTrimmedStringInput(value.eyebrow),
    description: coerceTrimmedStringInput(value.description),
    ariaLabel: coerceTrimmedStringInput(value.ariaLabel),
    tone: coerceStringEnumInput(value.tone, ['neutral', 'brand'] as const),
    layout: coerceStringEnumInput(value.layout, ['stacked', 'split'] as const),
    bordered: coerceOptionalBooleanInput(value.bordered),
    elevated: coerceOptionalBooleanInput(value.elevated),
    details: sanitizeDescriptionListItems(value.details),
    detailsLayout: coerceStringEnumInput(value.detailsLayout, ['stacked', 'inline'] as const),
    statusLabel: coerceTrimmedStringInput(value.statusLabel),
    statusTone: coerceStringEnumInput(
      value.statusTone,
      ['neutral', 'success', 'warning', 'critical', 'pending', 'inactive', 'blocked'] as const,
    ),
  });
}

@Component({
  selector: 'syn-overview-card',
  standalone: true,
  imports: [DescriptionListComponent, HeadingComponent, StatusTagComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="syn-overview-card"
      [class]="cardClass()"
      [attr.aria-label]="ariaLabel() || title() || null"
    >
      <div class="syn-overview-card__main">
        @if (eyebrow() || title() || subtitle() || description() || statusLabel()) {
          <header class="syn-overview-card__header">
            <div class="syn-overview-card__copy">
              @if (statusLabel()) {
                <syn-status-tag [label]="statusLabel()" [tone]="statusTone()" />
              }

              @if (title()) {
                <syn-heading
                  [text]="title()"
                  [eyebrow]="eyebrow()"
                  [supportingText]="subtitle()"
                  level="h3"
                  size="md"
                />
              }

              @if (description()) {
                <p class="syn-overview-card__description">{{ description() }}</p>
              }
            </div>
          </header>
        }

        <div class="syn-overview-card__body">
          <ng-content />
        </div>

        <footer class="syn-overview-card__footer">
          <ng-content select="[slot=footer]" />
        </footer>
      </div>

      @if (details().length > 0) {
        <aside class="syn-overview-card__aside">
          <syn-description-list [items]="details()" [layout]="detailsLayout()" />
        </aside>
      }
    </article>
  `,
  styleUrl: './overview-card.scss',
})
export class OverviewCardComponent {
  readonly config = input<Partial<OverviewCardConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<OverviewCardConfig>(sanitizeOverviewCardConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly subtitleInput = input<string | undefined>(undefined, { alias: 'subtitle' });
  readonly eyebrowInput = input<string | undefined>(undefined, { alias: 'eyebrow' });
  readonly descriptionInput = input<string | undefined>(undefined, { alias: 'description' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly toneInput = input<OverviewCardTone | undefined>(undefined, { alias: 'tone' });
  readonly layoutInput = input<OverviewCardLayout | undefined>(undefined, { alias: 'layout' });
  readonly borderedInput = input<boolean | undefined>(undefined, { alias: 'bordered' });
  readonly elevatedInput = input<boolean | undefined>(undefined, { alias: 'elevated' });
  readonly detailsInput = input<readonly DescriptionListItem[] | undefined>(undefined, {
    alias: 'details',
  });
  readonly detailsLayoutInput = input<DescriptionListLayout | undefined>(undefined, {
    alias: 'detailsLayout',
  });
  readonly statusLabelInput = input<string | undefined>(undefined, { alias: 'statusLabel' });
  readonly statusToneInput = input<StatusTagTone | undefined>(undefined, {
    alias: 'statusTone',
  });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly subtitle = computed(() =>
    resolveConfigValue(this.subtitleInput(), this.config()?.subtitle, ''),
  );
  readonly eyebrow = computed(() =>
    resolveConfigValue(this.eyebrowInput(), this.config()?.eyebrow, ''),
  );
  readonly description = computed(() =>
    resolveConfigValue(this.descriptionInput(), this.config()?.description, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.config()?.ariaLabel, ''),
  );
  readonly tone = computed(() =>
    resolveConfigValue(this.toneInput(), this.config()?.tone, 'neutral'),
  );
  readonly layout = computed(() =>
    resolveConfigValue(this.layoutInput(), this.config()?.layout, 'split'),
  );
  readonly bordered = computed(() =>
    resolveConfigValue(this.borderedInput(), this.config()?.bordered, true),
  );
  readonly elevated = computed(() =>
    resolveConfigValue(this.elevatedInput(), this.config()?.elevated, false),
  );
  readonly details = computed(() =>
    resolveConfigArray(this.detailsInput(), this.config()?.details),
  );
  readonly detailsLayout = computed(() =>
    resolveConfigValue(this.detailsLayoutInput(), this.config()?.detailsLayout, 'stacked'),
  );
  readonly statusLabel = computed(() =>
    resolveConfigValue(this.statusLabelInput(), this.config()?.statusLabel, ''),
  );
  readonly statusTone = computed(() =>
    resolveConfigValue(this.statusToneInput(), this.config()?.statusTone, 'neutral'),
  );

  readonly cardClass = computed(() =>
    classNames(
      'syn-overview-card',
      `syn-overview-card--${this.tone()}`,
      `syn-overview-card--${this.layout()}`,
      this.bordered() && 'syn-overview-card--bordered',
      this.elevated() && 'syn-overview-card--elevated',
    ),
  );
}
