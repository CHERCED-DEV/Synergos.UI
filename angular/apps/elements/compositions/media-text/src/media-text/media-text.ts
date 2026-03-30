import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { ButtonComponent } from '@synergos/shared';

@Component({
  selector: 'sg-media-text',
  imports: [ButtonComponent],
  templateUrl: './media-text.html',
  styleUrl: './media-text.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-media-text' },
})
export class MediaTextComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly imageSrc = input<string>('');
  readonly imageAlt = input<string>('');
  readonly headingText = input<string>('');
  readonly body = input<string>('');
  readonly ctaLabel = input<string>('');
  readonly ctaUrl = input<string>('');
  readonly mediaPosition = input<string>('left');
  readonly theme = input<string>('light');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly hasCta = computed(() => !!this.ctaLabel() && !!this.ctaUrl());
  readonly hostClasses = computed(() => `sg-media-text--${this.mediaPosition()} sg-media-text--${this.theme()}`);
}
