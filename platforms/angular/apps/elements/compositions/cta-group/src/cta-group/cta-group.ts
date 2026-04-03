import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CtaGroupElementConfig } from '@synergos/contracts';
import { ButtonComponent, coerceConfigInput, resolveConfigValue } from '@synergos/shared';

@Component({
  selector: 'sg-cta-group',
  imports: [ButtonComponent],
  templateUrl: './cta-group.html',
  styleUrl: './cta-group.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-cta-group' },
})
export class CtaGroupComponent {
  readonly config = input<Partial<CtaGroupElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<CtaGroupElementConfig>,
  });
  readonly primaryLabelInput = input<string | undefined>(undefined, { alias: 'primaryLabel' });
  readonly primaryUrlInput = input<string | undefined>(undefined, { alias: 'primaryUrl' });
  readonly primaryTargetInput = input<string | undefined>(undefined, { alias: 'primaryTarget' });
  readonly primaryVariantInput = input<string | undefined>(undefined, { alias: 'primaryVariant' });
  readonly secondaryLabelInput = input<string | undefined>(undefined, { alias: 'secondaryLabel' });
  readonly secondaryUrlInput = input<string | undefined>(undefined, { alias: 'secondaryUrl' });
  readonly secondaryTargetInput = input<string | undefined>(undefined, { alias: 'secondaryTarget' });
  readonly secondaryVariantInput = input<string | undefined>(undefined, { alias: 'secondaryVariant' });
  readonly alignmentInput = input<string | undefined>(undefined, { alias: 'alignment' });

  readonly primaryLabel = computed(() =>
    resolveConfigValue(this.primaryLabelInput(), this.config()?.primaryLabel, ''),
  );
  readonly primaryUrl = computed(() =>
    resolveConfigValue(this.primaryUrlInput(), this.config()?.primaryUrl, ''),
  );
  readonly primaryTarget = computed(() =>
    resolveConfigValue(this.primaryTargetInput(), this.config()?.primaryTarget, '_self'),
  );
  readonly primaryVariant = computed(() =>
    resolveConfigValue(this.primaryVariantInput(), this.config()?.primaryVariant, 'solid'),
  );
  readonly secondaryLabel = computed(() =>
    resolveConfigValue(this.secondaryLabelInput(), this.config()?.secondaryLabel, ''),
  );
  readonly secondaryUrl = computed(() =>
    resolveConfigValue(this.secondaryUrlInput(), this.config()?.secondaryUrl, ''),
  );
  readonly secondaryTarget = computed(() =>
    resolveConfigValue(this.secondaryTargetInput(), this.config()?.secondaryTarget, '_self'),
  );
  readonly secondaryVariant = computed(() =>
    resolveConfigValue(this.secondaryVariantInput(), this.config()?.secondaryVariant, 'outline'),
  );
  readonly alignment = computed(() =>
    resolveConfigValue(this.alignmentInput(), this.config()?.alignment, 'left'),
  );

  readonly hasPrimary = computed(() => !!this.primaryLabel() && !!this.primaryUrl());
  readonly hasSecondary = computed(() => !!this.secondaryLabel() && !!this.secondaryUrl());
  readonly hostClasses = computed(() => `sg-cta-group--${this.alignment()}`);
}
