import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/**
 * `syn-status-banner` — persistent, non-intrusive degradation banner (doc 22 §6,
 * item 4). The canonical home for the "estás viendo datos de ejemplo" message
 * that academy and blogs today spell differently. It is **not** a takeover and
 * **not** an alert: `role="status"` + `aria-live="polite"` announce it calmly,
 * and it stays put alongside the real content while the `ViewState` is `degraded`.
 *
 * The `degraded` tone consumes the dedicated **`--syn-color-state-degraded-*`**
 * token (warning ~12% surface / 700 text) — a distinct semantic role, not raw
 * warning — so "sample data" reads the same across every app and theme. `info`
 * reuses the state-info ramp for neutral notices. Optionally dismissable.
 */
export type StatusBannerTone = 'degraded' | 'info';

@Component({
  selector: 'syn-status-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'syn-status-banner',
    role: 'status',
    'aria-live': 'polite',
  },
  styleUrl: './status-banner.scss',
  template: `
    @if (!dismissed()) {
      <div class="syn-status" [attr.data-tone]="tone()">
        <span class="syn-status__icon" aria-hidden="true">ⓘ</span>
        <p class="syn-status__message">{{ message() }}</p>
        @if (dismissable()) {
          <button
            type="button"
            class="syn-status__dismiss"
            [attr.aria-label]="dismissLabel()"
            (click)="onDismiss()"
          >
            ×
          </button>
        }
      </div>
    }
  `,
})
export class SynStatusBannerComponent {
  /** The persistent message — e.g. "Estás viendo datos de ejemplo." */
  readonly message = input.required<string>();
  /** Semantic role: `degraded` (sample/stale data) or `info` (neutral notice). */
  readonly tone = input<StatusBannerTone>('degraded');
  /** Whether the viewer may dismiss the banner. */
  readonly dismissable = input(false);
  /** Accessible label for the dismiss control. */
  readonly dismissLabel = input('Descartar');

  /** Emitted when the viewer dismisses the banner. */
  readonly dismiss = output<void>();

  protected readonly dismissed = signal(false);

  onDismiss(): void {
    if (this.dismissed()) {
      return;
    }
    this.dismissed.set(true);
    this.dismiss.emit();
  }
}
