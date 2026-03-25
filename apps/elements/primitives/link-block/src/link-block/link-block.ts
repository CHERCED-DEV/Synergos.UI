import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

@Component({
  selector: 'sg-link-block',
  imports: [],
  templateUrl: './link-block.html',
  styleUrl: './link-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-link-block' },
})
export class LinkBlockComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly href = input<string>('');
  readonly label = input<string>('');
  readonly target = input<string>('_self');
  readonly ariaLabel = input<string>('');
  readonly variant = input<string>('default');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly hostClasses = computed(() => `sg-link-block--${this.variant()}`);
}
