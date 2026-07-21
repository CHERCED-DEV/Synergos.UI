import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * `syn-tracking-timeline` — the P4 state-timeline organism used inside SH-4
 * (and standalone). Renders ordered stages with dates and a done/current/pending
 * state. Domain-free: an order, a trip, a trámite and an envío all render the
 * same way (`Order ≈ Booking ≈ Ticket ≈ Radicado`, doc 21 §1.4).
 */

/** One stage in the timeline. */
export interface TrackingStage {
  readonly id: string;
  readonly label: string;
  /** Display date/time (already formatted by the consumer). */
  readonly date?: string;
  readonly description?: string;
  readonly state: 'done' | 'current' | 'pending';
}

@Component({
  selector: 'syn-tracking-timeline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-tracking-timeline' },
  styleUrl: './tracking-timeline.scss',
  template: `
    @if (heading()) {
      <h3 class="syn-timeline__heading">{{ heading() }}</h3>
    }
    @if (stages().length === 0) {
      <p class="syn-timeline__empty">{{ emptyMessage() }}</p>
    } @else {
      <ol class="syn-timeline" [attr.aria-label]="ariaLabel()">
        @for (stage of stages(); track stage.id) {
          <li
            class="syn-timeline__stage"
            [class.is-done]="stage.state === 'done'"
            [class.is-current]="stage.state === 'current'"
            [attr.aria-current]="stage.state === 'current' ? 'step' : null"
          >
            <span class="syn-timeline__marker" aria-hidden="true"></span>
            <span class="syn-timeline__body">
              <span class="syn-timeline__label">{{ stage.label }}</span>
              @if (stage.date) {
                <span class="syn-timeline__date">{{ stage.date }}</span>
              }
              @if (stage.description) {
                <span class="syn-timeline__desc">{{ stage.description }}</span>
              }
            </span>
          </li>
        }
      </ol>
    }
  `,
})
export class TrackingTimelineComponent {
  readonly stages = input<readonly TrackingStage[]>([]);
  readonly heading = input('');
  readonly ariaLabel = input('Seguimiento');
  readonly emptyMessage = input('Sin información de seguimiento.');
}
