import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { ButtonComponent } from '@synergos/shared';

type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonVariant = 'solid' | 'outline' | 'ghost';

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
  readonly label = input<string>('');
  readonly variant = input<string>('solid');
  readonly size = input<string>('md');
  readonly href = input<string>('');
  readonly target = input<string>('_self');
  readonly disabled = input(false, { transform: booleanAttribute });

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
