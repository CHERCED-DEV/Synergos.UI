import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ButtonContainerElementConfig } from '@synergos/contracts';
import {
  ButtonComponent,
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonVariant = 'solid' | 'outline' | 'ghost';

function resolveButtonVariant(value: string): ButtonVariant {
  return value === 'outline' || value === 'ghost' ? value : 'solid';
}

function resolveButtonSize(value: string): ButtonSize {
  return value === 'sm' || value === 'lg' ? value : 'md';
}

function sanitizeButtonContainerConfig(
  value: Partial<ButtonContainerElementConfig>,
): Partial<ButtonContainerElementConfig> {
  return omitUndefinedProperties<Partial<ButtonContainerElementConfig>>({
    label: coerceTrimmedStringInput(value.label),
    href: coerceTrimmedStringInput(value.href),
    target: coerceTrimmedStringInput(value.target),
    variant: coerceTrimmedStringInput(value.variant),
    size: coerceTrimmedStringInput(value.size),
    disabled: coerceOptionalBooleanInput(value.disabled),
    loading: coerceOptionalBooleanInput(value.loading),
    loadingLabel: coerceTrimmedStringInput(value.loadingLabel),
  });
}

@Component({
  selector: 'sg-button-container',
  imports: [ButtonComponent],
  templateUrl: './button-container.html',
  styleUrl: './button-container.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-button-container' },
})
export class ButtonContainerComponent {
  readonly config = input<Partial<ButtonContainerElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<ButtonContainerElementConfig>>(sanitizeButtonContainerConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly sizeInput = input<string | undefined>(undefined, { alias: 'size' });
  readonly hrefInput = input<string | undefined>(undefined, { alias: 'href' });
  readonly targetInput = input<string | undefined>(undefined, { alias: 'target' });
  readonly loadingInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'loading',
    transform: coerceOptionalBooleanInput,
  });
  readonly loadingLabelInput = input<string | undefined>(undefined, { alias: 'loadingLabel' });

  readonly disabledInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'disabled',
    transform: coerceOptionalBooleanInput,
  });

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, ''),
  );
  readonly variant = computed(() => resolveConfigValue(this.variantInput(), this.config()?.variant, 'solid'));
  readonly size = computed(() => resolveConfigValue(this.sizeInput(), this.config()?.size, 'md'));
  readonly href = computed(() =>
    resolveConfigValue(this.hrefInput(), this.config()?.href, ''),
  );
  readonly target = computed(() =>
    resolveConfigValue(this.targetInput(), this.config()?.target, '_self'),
  );
  readonly disabled = computed(() => resolveConfigValue(this.disabledInput(), this.config()?.disabled, false));
  readonly loading = computed(() => resolveConfigValue(this.loadingInput(), this.config()?.loading, false));
  readonly loadingLabel = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.loadingLabelInput()), this.config()?.loadingLabel, ''),
  );

  readonly isLink = computed(() => this.href().trim().length > 0);
  readonly resolvedVariant = computed<ButtonVariant>(() =>
    resolveButtonVariant(this.variant()),
  );
  readonly resolvedSize = computed<ButtonSize>(() =>
    resolveButtonSize(this.size()),
  );
  readonly resolvedRel = computed(() =>
    this.target() === '_blank' ? 'noopener noreferrer' : null,
  );
}
