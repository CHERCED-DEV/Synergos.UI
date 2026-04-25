import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynNotificationCenter</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-notification-center',
  standalone: true,
  templateUrl: './notification-center.html',
  styleUrl: './notification-center.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-notification-center' },
})
export class NotificationCenterElementComponent {
  readonly fetchEndpoint = input<string | undefined>(undefined);
  readonly pollingInterval = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
