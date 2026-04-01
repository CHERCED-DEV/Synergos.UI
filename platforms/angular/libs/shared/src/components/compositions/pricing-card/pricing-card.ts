import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import {
  coerceConfigInput,
  resolveConfigArray,
  resolveConfigValue,
} from '../../../utils/config-input.util';
import { BadgeComponent } from '../../primitives/badge/badge';
import { ButtonComponent } from '../../primitives/button/button';
import { HeadingComponent } from '../../primitives/heading/heading';
import { IconComponent } from '../../primitives/icon/icon';
import {
  ListComponent,
  type ListItem,
} from '../../primitives/list/list';
import {
  StatusTagComponent,
  type StatusTagTone,
} from '../../primitives/status-tag/status-tag';

export type PricingCardTone = 'neutral' | 'brand';
export type PricingCardActionVariant = 'solid' | 'outline' | 'ghost';

export interface PricingCardConfig {
  readonly title?: string;
  readonly description?: string;
  readonly ariaLabel?: string;
  readonly amount?: number | string | null;
  readonly amountPrefix?: string;
  readonly amountSuffix?: string;
  readonly currency?: string;
  readonly priceDescription?: string;
  readonly unavailableMessage?: string;
  readonly badgeText?: string;
  readonly iconSymbol?: string;
  readonly highlights?: readonly string[];
  readonly actionLabel?: string;
  readonly actionVariant?: PricingCardActionVariant;
  readonly disabled?: boolean;
  readonly tone?: PricingCardTone;
  readonly featured?: boolean;
  readonly statusLabel?: string;
  readonly statusTone?: StatusTagTone;
}

@Component({
  selector: 'syn-pricing-card',
  standalone: true,
  imports: [
    BadgeComponent,
    ButtonComponent,
    HeadingComponent,
    IconComponent,
    ListComponent,
    StatusTagComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="syn-pricing-card"
      [class]="cardClass()"
      [attr.aria-label]="ariaLabel() || title() || null"
    >
      <header class="syn-pricing-card__header">
        <div class="syn-pricing-card__copy">
          @if (badgeText()) {
            <syn-badge [text]="badgeText()" tone="brand" />
          }

          @if (statusLabel()) {
            <syn-status-tag [label]="statusLabel()" [tone]="statusTone()" />
          }

          <div class="syn-pricing-card__heading">
            @if (iconSymbol()) {
              <syn-icon [symbol]="iconSymbol()" tone="brand" />
            }

            <syn-heading
              [text]="title()"
              [supportingText]="description()"
              level="h3"
              size="lg"
            />
          </div>
        </div>

        <div class="syn-pricing-card__price">
          @if (hasPrice()) {
            <div class="syn-pricing-card__amount-group">
              @if (amountPrefix()) {
                <span class="syn-pricing-card__amount-prefix">{{ amountPrefix() }}</span>
              }

              <span class="syn-pricing-card__amount">{{ formattedAmount() }}</span>

              @if (currency()) {
                <span class="syn-pricing-card__currency">{{ currency() }}</span>
              }
            </div>

            @if (amountSuffix()) {
              <span class="syn-pricing-card__amount-suffix">{{ amountSuffix() }}</span>
            }

            @if (priceDescription()) {
              <p class="syn-pricing-card__price-description">{{ priceDescription() }}</p>
            }
          } @else if (unavailableMessage()) {
            <p class="syn-pricing-card__unavailable">{{ unavailableMessage() }}</p>
          }
        </div>
      </header>

      @if (highlightItems().length > 0) {
        <div class="syn-pricing-card__highlights">
          <syn-list [items]="highlightItems()" marker="check" density="compact" />
        </div>
      }

      <div class="syn-pricing-card__body">
        <ng-content />
      </div>

      @if (actionLabel()) {
        <footer class="syn-pricing-card__footer">
          <syn-button
            [label]="actionLabel()"
            [variant]="actionVariant()"
            [disabled]="disabled()"
            (pressed)="action.emit()"
          />
        </footer>
      }
    </article>
  `,
  styleUrl: './pricing-card.scss',
})
export class PricingCardComponent {
  readonly configInput = input<Partial<PricingCardConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<PricingCardConfig>,
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly descriptionInput = input<string | undefined>(undefined, { alias: 'description' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly amountInput = input<number | string | null | undefined>(undefined, { alias: 'amount' });
  readonly amountPrefixInput = input<string | undefined>(undefined, { alias: 'amountPrefix' });
  readonly amountSuffixInput = input<string | undefined>(undefined, { alias: 'amountSuffix' });
  readonly currencyInput = input<string | undefined>(undefined, { alias: 'currency' });
  readonly priceDescriptionInput = input<string | undefined>(undefined, {
    alias: 'priceDescription',
  });
  readonly unavailableMessageInput = input<string | undefined>(undefined, {
    alias: 'unavailableMessage',
  });
  readonly badgeTextInput = input<string | undefined>(undefined, { alias: 'badgeText' });
  readonly iconSymbolInput = input<string | undefined>(undefined, { alias: 'iconSymbol' });
  readonly highlightsInput = input<readonly string[] | undefined>(undefined, {
    alias: 'highlights',
  });
  readonly actionLabelInput = input<string | undefined>(undefined, { alias: 'actionLabel' });
  readonly actionVariantInput = input<PricingCardActionVariant | undefined>(undefined, {
    alias: 'actionVariant',
  });
  readonly disabledInput = input<boolean | undefined>(undefined, { alias: 'disabled' });
  readonly toneInput = input<PricingCardTone | undefined>(undefined, { alias: 'tone' });
  readonly featuredInput = input<boolean | undefined>(undefined, { alias: 'featured' });
  readonly statusLabelInput = input<string | undefined>(undefined, { alias: 'statusLabel' });
  readonly statusToneInput = input<StatusTagTone | undefined>(undefined, {
    alias: 'statusTone',
  });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.configInput()?.title, ''),
  );
  readonly description = computed(() =>
    resolveConfigValue(this.descriptionInput(), this.configInput()?.description, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.configInput()?.ariaLabel, ''),
  );
  readonly amount = computed<number | string | null>(() =>
    resolveConfigValue(this.amountInput(), this.configInput()?.amount, null),
  );
  readonly amountPrefix = computed(() =>
    resolveConfigValue(this.amountPrefixInput(), this.configInput()?.amountPrefix, ''),
  );
  readonly amountSuffix = computed(() =>
    resolveConfigValue(this.amountSuffixInput(), this.configInput()?.amountSuffix, ''),
  );
  readonly currency = computed(() =>
    resolveConfigValue(this.currencyInput(), this.configInput()?.currency, ''),
  );
  readonly priceDescription = computed(() =>
    resolveConfigValue(
      this.priceDescriptionInput(),
      this.configInput()?.priceDescription,
      '',
    ),
  );
  readonly unavailableMessage = computed(() =>
    resolveConfigValue(
      this.unavailableMessageInput(),
      this.configInput()?.unavailableMessage,
      '',
    ),
  );
  readonly badgeText = computed(() =>
    resolveConfigValue(this.badgeTextInput(), this.configInput()?.badgeText, ''),
  );
  readonly iconSymbol = computed(() =>
    resolveConfigValue(this.iconSymbolInput(), this.configInput()?.iconSymbol, ''),
  );
  readonly highlights = computed(() =>
    resolveConfigArray(this.highlightsInput(), this.configInput()?.highlights),
  );
  readonly actionLabel = computed(() =>
    resolveConfigValue(this.actionLabelInput(), this.configInput()?.actionLabel, ''),
  );
  readonly actionVariant = computed(() =>
    resolveConfigValue(this.actionVariantInput(), this.configInput()?.actionVariant, 'solid'),
  );
  readonly disabled = computed(() =>
    resolveConfigValue(this.disabledInput(), this.configInput()?.disabled, false),
  );
  readonly tone = computed(() =>
    resolveConfigValue(this.toneInput(), this.configInput()?.tone, 'neutral'),
  );
  readonly featured = computed(() =>
    resolveConfigValue(this.featuredInput(), this.configInput()?.featured, false),
  );
  readonly statusLabel = computed(() =>
    resolveConfigValue(this.statusLabelInput(), this.configInput()?.statusLabel, ''),
  );
  readonly statusTone = computed(() =>
    resolveConfigValue(this.statusToneInput(), this.configInput()?.statusTone, 'neutral'),
  );

  readonly action = output<void>();

  readonly highlightItems = computed<readonly ListItem[]>(() =>
    this.highlights().map((label, index) => ({
      id: `pricing-highlight-${index}`,
      label,
    })),
  );

  readonly formattedAmount = computed(() => {
    const amount = this.amount();
    if (amount === null) {
      return '';
    }

    if (typeof amount === 'number') {
      return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 2,
      }).format(amount);
    }

    return amount.trim();
  });

  readonly hasPrice = computed(() => this.formattedAmount().length > 0);
  readonly cardClass = computed(() =>
    classNames(
      'syn-pricing-card',
      `syn-pricing-card--${this.tone()}`,
      this.featured() && 'syn-pricing-card--featured',
      this.disabled() && 'syn-pricing-card--disabled',
    ),
  );
}
