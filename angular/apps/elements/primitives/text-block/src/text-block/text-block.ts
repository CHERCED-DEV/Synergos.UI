import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

@Component({
  selector: 'sg-text-block',
  imports: [],
  templateUrl: './text-block.html',
  styleUrl: './text-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-text-block' },
})
export class TextBlockComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly headingText = input<string>('');
  readonly headingLevel = input<string>('h2');
  readonly body = input<string>('');
  readonly alignment = input<string>('left');
  readonly theme = input<string>('light');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly hostClasses = computed(() => `sg-text-block--${this.alignment()} sg-text-block--${this.theme()}`);
}
