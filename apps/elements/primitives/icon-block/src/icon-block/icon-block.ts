import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

@Component({
  selector: 'sg-icon-block',
  imports: [],
  templateUrl: './icon-block.html',
  styleUrl: './icon-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-icon-block' },
})
export class IconBlockComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly icon = input<string>('');
  readonly size = input<string>('md');
  readonly color = input<string>('');
  readonly ariaLabel = input<string>('');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly hostClasses = computed(() => `sg-icon-block--${this.size()}`);
}
