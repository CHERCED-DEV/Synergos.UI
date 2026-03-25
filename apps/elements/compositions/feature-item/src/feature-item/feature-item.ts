import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

@Component({
  selector: 'sg-feature-item',
  imports: [],
  templateUrl: './feature-item.html',
  styleUrl: './feature-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-feature-item' },
})
export class FeatureItemComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly icon = input<string>('');
  readonly headingText = input<string>('');
  readonly body = input<string>('');
  readonly variant = input<string>('default');
  readonly theme = input<string>('light');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly hostClasses = computed(() => `sg-feature-item--${this.variant()} sg-feature-item--${this.theme()}`);
}
