import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  ButtonComponent,
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonVariant = 'solid' | 'outline' | 'ghost';

export interface ButtonContainerConfig {
  readonly label?: string;
  readonly variant?: string;
  readonly size?: string;
  readonly href?: string;
  readonly target?: string;
  readonly disabled?: boolean;
}

function resolveButtonVariant(value: string): ButtonVariant {
  return value === 'outline' || value === 'ghost' ? value : 'solid';
}

function resolveButtonSize(value: string): ButtonSize {
  return value === 'sm' || value === 'lg' ? value : 'md';
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
  readonly configInput = input<Partial<ButtonContainerConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<ButtonContainerConfig>,
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly sizeInput = input<string | undefined>(undefined, { alias: 'size' });
  readonly hrefInput = input<string | undefined>(undefined, { alias: 'href' });
  readonly targetInput = input<string | undefined>(undefined, { alias: 'target' });
  readonly disabledInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'disabled',
    transform: coerceOptionalBooleanInput,
  });

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.configInput()?.label, ''),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'solid'),
  );
  readonly size = computed(() =>
    resolveConfigValue(this.sizeInput(), this.configInput()?.size, 'md'),
  );
  readonly href = computed(() =>
    resolveConfigValue(this.hrefInput(), this.configInput()?.href, ''),
  );
  readonly target = computed(() =>
    resolveConfigValue(this.targetInput(), this.configInput()?.target, '_self'),
  );
  readonly disabled = computed(() =>
    resolveConfigValue(this.disabledInput(), this.configInput()?.disabled, false),
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
