import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { ButtonComponent } from '@synergos/shared';

@Component({
  selector: 'sg-info-block',
  imports: [ButtonComponent],
  templateUrl: './info-block.html',
  styleUrl: './info-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-info-block' },
})
export class InfoBlockComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly title = input<string>('');
  readonly body = input<string>('');
  readonly ctaLabel = input<string>('');
  readonly ctaUrl = input<string>('');
  readonly variant = input<string>('default');
  readonly theme = input<string>('light');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly hasCta = computed(() => !!this.ctaLabel() && !!this.ctaUrl());
  readonly hostClasses = computed(() => `sg-info-block--${this.variant()} sg-info-block--${this.theme()}`);
}
