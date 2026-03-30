import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { ButtonComponent } from '@synergos/shared';

@Component({
  selector: 'sg-cta-group',
  imports: [ButtonComponent],
  templateUrl: './cta-group.html',
  styleUrl: './cta-group.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-cta-group' },
})
export class CtaGroupComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly primaryLabel = input<string>('');
  readonly primaryUrl = input<string>('');
  readonly secondaryLabel = input<string>('');
  readonly secondaryUrl = input<string>('');
  readonly alignment = input<string>('left');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly hasPrimary = computed(() => !!this.primaryLabel() && !!this.primaryUrl());
  readonly hasSecondary = computed(() => !!this.secondaryLabel() && !!this.secondaryUrl());
  readonly hostClasses = computed(() => `sg-cta-group--${this.alignment()}`);
}
