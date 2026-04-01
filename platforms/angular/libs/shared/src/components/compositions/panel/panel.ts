import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { LiveAnnouncerService } from '../../../services/live-announcer.service';
import { classNames } from '../../../utils/class-names.util';
import { BadgeComponent } from '../../primitives/badge/badge';

type PanelTone = 'neutral' | 'brand' | 'success' | 'warning' | 'critical';
type PanelPadding = 'sm' | 'md' | 'lg';

@Component({
  selector: 'syn-panel',
  standalone: true,
  imports: [BadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <section
        class="syn-panel"
        [class]="panelClass()"
        role="region"
        [attr.aria-label]="ariaLabel() || title() || null"
      >
        <div class="syn-panel__main">
          @if (badgeText()) {
            <syn-badge class="syn-panel__badge" [text]="badgeText()" [tone]="badgeTone()" />
          }

          @if (title() || description()) {
            <header class="syn-panel__header">
              @if (title()) {
                <h3 class="syn-panel__title">{{ title() }}</h3>
              }

              @if (description()) {
                <p class="syn-panel__description">{{ description() }}</p>
              }
            </header>
          }

          <div class="syn-panel__content">
            <ng-content />
          </div>
        </div>

        @if (dismissible()) {
          <button
            type="button"
            class="syn-panel__dismiss"
            [attr.aria-label]="dismissLabel()"
            (click)="dismiss()"
          >
            x
          </button>
        }
      </section>
    }
  `,
  styleUrl: './panel.scss',
})
export class PanelComponent {
  readonly #announcer = inject(LiveAnnouncerService);
  readonly #visible = signal(true);

  readonly title = input('');
  readonly description = input('');
  readonly ariaLabel = input('');
  readonly badgeText = input('');
  readonly tone = input<PanelTone>('neutral');
  readonly padding = input<PanelPadding>('md');
  readonly bordered = input(true);
  readonly dismissible = input(false);
  readonly dismissLabel = input('Dismiss panel');

  readonly visible = this.#visible.asReadonly();
  readonly dismissed = output<void>();

  readonly badgeTone = computed(() => (this.tone() === 'brand' ? 'brand' : 'neutral'));
  readonly panelClass = computed(() =>
    classNames(
      'syn-panel',
      `syn-panel--${this.tone()}`,
      `syn-panel--padding-${this.padding()}`,
      this.bordered() && 'syn-panel--bordered',
      this.dismissible() && 'syn-panel--dismissible',
    ),
  );

  dismiss(): void {
    this.#visible.set(false);
    this.#announcer.announce('Panel dismissed');
    this.dismissed.emit();
  }
}
