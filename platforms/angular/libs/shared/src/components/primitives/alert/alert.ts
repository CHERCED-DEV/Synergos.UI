import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

type AlertTone = 'neutral' | 'brand' | 'critical';

@Component({
  selector: 'syn-alert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <section
        class="syn-alert"
        [class.syn-alert--neutral]="tone() === 'neutral'"
        [class.syn-alert--brand]="tone() === 'brand'"
        [class.syn-alert--critical]="tone() === 'critical'"
        role="alert"
        aria-live="polite"
      >
        <div class="syn-alert__content">
          @if (title()) {
            <h3 class="syn-alert__title">{{ title() }}</h3>
          }

          @if (description()) {
            <p class="syn-alert__description">{{ description() }}</p>
          }
        </div>

        @if (dismissible()) {
          <button
            type="button"
            class="syn-alert__dismiss"
            [attr.aria-label]="dismissLabel()"
            (click)="dismiss()"
          >
            x
          </button>
        }
      </section>
    }
  `,
  styleUrl: './alert.scss',
})
export class AlertComponent {
  readonly title = input('');
  readonly description = input('');
  readonly tone = input<AlertTone>('neutral');
  readonly dismissible = input(true);
  readonly dismissLabel = input('Close alert');

  readonly #visible = signal(true);
  readonly visible = this.#visible.asReadonly();

  readonly dismissed = output<void>();

  dismiss(): void {
    this.#visible.set(false);
    this.dismissed.emit();
  }
}