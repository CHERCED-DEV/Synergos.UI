import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynCalendar</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-calendar',
  standalone: true,
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-calendar' },
})
export class CalendarElementComponent {
  readonly eventsEndpoint = input<string | undefined>(undefined);
  readonly initialMonth = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
