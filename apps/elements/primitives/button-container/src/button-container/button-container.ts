import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { ButtonComponent } from '@synergos/shared';

@Component({
  selector: 'sg-button-container',
  imports: [ButtonComponent],
  templateUrl: './button-container.html',
  styleUrl: './button-container.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-button-container' },
})
export class ButtonContainerComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly label = input<string>('');
  readonly variant = input<string>('solid');
  readonly size = input<string>('md');
  readonly href = input<string>('');
  readonly target = input<string>('_self');
  readonly disabled = input<boolean>(false);

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly isLink = computed(() => !!this.href());
}
