import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import {
  coerceConfigInput,
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
  readonly configInput = input<Partial<OverviewCardConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<OverviewCardConfig>,
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
    resolveConfigValue(this.titleInput(), this.configInput()?.title, ''),
  );
  readonly subtitle = computed(() =>
    resolveConfigValue(this.subtitleInput(), this.configInput()?.subtitle, ''),
  );
  readonly eyebrow = computed(() =>
    resolveConfigValue(this.eyebrowInput(), this.configInput()?.eyebrow, ''),
  );
  readonly description = computed(() =>
    resolveConfigValue(this.descriptionInput(), this.configInput()?.description, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.configInput()?.ariaLabel, ''),
  );
  readonly tone = computed(() =>
    resolveConfigValue(this.toneInput(), this.configInput()?.tone, 'neutral'),
  );
  readonly layout = computed(() =>
    resolveConfigValue(this.layoutInput(), this.configInput()?.layout, 'split'),
  );
  readonly bordered = computed(() =>
    resolveConfigValue(this.borderedInput(), this.configInput()?.bordered, true),
  );
  readonly elevated = computed(() =>
    resolveConfigValue(this.elevatedInput(), this.configInput()?.elevated, false),
  );
  readonly details = computed(() =>
    resolveConfigArray(this.detailsInput(), this.configInput()?.details),
  );
  readonly detailsLayout = computed(() =>
    resolveConfigValue(this.detailsLayoutInput(), this.configInput()?.detailsLayout, 'stacked'),
  );
  readonly statusLabel = computed(() =>
    resolveConfigValue(this.statusLabelInput(), this.configInput()?.statusLabel, ''),
  );
  readonly statusTone = computed(() =>
    resolveConfigValue(this.statusToneInput(), this.configInput()?.statusTone, 'neutral'),
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
