import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { coerceConfigInput, resolveConfigValue } from '../../../utils/config-input.util';

type ButtonVariant = 'solid' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonConfig {
  readonly label?: string;
  readonly ariaLabel?: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly type?: 'button' | 'submit' | 'reset';
  readonly disabled?: boolean;
}

@Component({
  selector: 'syn-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      class="syn-button"
      [class.syn-button--solid]="variant() === 'solid'"
      [class.syn-button--outline]="variant() === 'outline'"
      [class.syn-button--ghost]="variant() === 'ghost'"
      [class.syn-button--sm]="size() === 'sm'"
      [class.syn-button--md]="size() === 'md'"
      [class.syn-button--lg]="size() === 'lg'"
      [type]="type()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel() || label() || null"
      (click)="onClick($event)"
    >
      @if (label()) {
        <span>{{ label() }}</span>
      } @else {
        <ng-content />
      }
    </button>
  `,
  styleUrl: './button.scss',
})
export class ButtonComponent {
  readonly configInput = input<Partial<ButtonConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<ButtonConfig>,
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly variantInput = input<ButtonVariant | undefined>(undefined, { alias: 'variant' });
  readonly sizeInput = input<ButtonSize | undefined>(undefined, { alias: 'size' });
  readonly typeInput = input<'button' | 'submit' | 'reset' | undefined>(undefined, {
    alias: 'type',
  });
  readonly disabledInput = input<boolean | undefined>(undefined, { alias: 'disabled' });

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.configInput()?.label, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.configInput()?.ariaLabel, ''),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'solid'),
  );
  readonly size = computed(() =>
    resolveConfigValue(this.sizeInput(), this.configInput()?.size, 'md'),
  );
  readonly type = computed(() =>
    resolveConfigValue(this.typeInput(), this.configInput()?.type, 'button'),
  );
  readonly disabled = computed(() =>
    resolveConfigValue(this.disabledInput(), this.configInput()?.disabled, false),
  );

  readonly pressed = output<MouseEvent>();

  onClick(event: MouseEvent): void {
    if (this.disabled()) {
      event.preventDefault();
      return;
    }

    this.pressed.emit(event);
  }
}
