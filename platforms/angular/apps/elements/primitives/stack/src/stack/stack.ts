import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

@Component({
  selector: 'sg-stack',
  imports: [],
  templateUrl: './stack.html',
  styleUrl: './stack.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-stack' },
})
export class StackComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly direction = input<string>('column');
  readonly gap = input<string>('md');
  readonly alignment = input<string>('stretch');
  readonly wrap = input<boolean>(false);
  readonly theme = input<string>('light');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly hostClasses = computed(() => `sg-stack--${this.direction()} sg-stack--gap-${this.gap()} sg-stack--align-${this.alignment()}${this.wrap() ? ' sg-stack--wrap' : ''} sg-stack--${this.theme()}`);
}
