import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { ButtonComponent } from '@synergos/shared';

@Component({
  selector: 'sg-button-group',
  imports: [ButtonComponent],
  templateUrl: './button-group.html',
  styleUrl: './button-group.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-button-group' },
})
export class ButtonGroupComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly buttons = input<string>('[]');
  readonly alignment = input<string>('left');
  readonly gap = input<string>('sm');
  readonly direction = input<string>('row');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly parsedButtons = computed(() => {
    try { return JSON.parse(this.buttons()); }
    catch { return []; }
  });
  readonly hostClasses = computed(() => `sg-button-group--${this.alignment()} sg-button-group--${this.direction()} sg-button-group--gap-${this.gap()}`);
}
