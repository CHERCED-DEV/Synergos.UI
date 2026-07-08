import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * `syn-error-state` — inline recovery for a failed load (doc 22 §6, item 1 +
 * §3 item 3). Today academy/blogs handle errors *outside* the shell, breaking
 * encapsulation. This composes the error as part of the ViewState contract:
 * `role="alert"` announces the failure assertively, and a **"Reintentar"**
 * button re-runs the load **in place** — the surrounding context (filters,
 * scroll, selection) is preserved because only this region swapped, never the page.
 *
 * The consumer owns recovery: the shell emits `retry`, the consumer re-resolves
 * its data seam and flips the `ViewState` back to `loading`. When there is no
 * recovery path, set `retryable=false` to hide the button.
 */
@Component({
  selector: 'syn-error-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'syn-error-state',
    role: 'alert',
  },
  styleUrl: './error-state.scss',
  template: `
    <div class="syn-error">
      <span class="syn-error__icon" aria-hidden="true">⚠</span>
      <div class="syn-error__body">
        <h2 class="syn-error__title">{{ title() }}</h2>
        <p class="syn-error__message">{{ message() }}</p>
      </div>
      @if (retryable()) {
        <button type="button" class="syn-error__retry" (click)="retry.emit()">
          {{ retryLabel() }}
        </button>
      }
    </div>
  `,
})
export class SynErrorStateComponent {
  /** Heading — the human framing of the failure. */
  readonly title = input('Algo salió mal');
  /** Required detail — what failed / what the user can expect. */
  readonly message = input.required<string>();
  /** Whether an inline retry is possible. Hides the button when `false`. */
  readonly retryable = input(true);
  /** Retry button label. */
  readonly retryLabel = input('Reintentar');

  /** Emitted when "Reintentar" is pressed — the consumer re-runs the load. */
  readonly retry = output<void>();
}
