import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynNotificationToast</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-notification-toast',
  standalone: true,
  templateUrl: './notification-toast.html',
  styleUrl: './notification-toast.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-notification-toast' },
})
export class NotificationToastElementComponent {
  readonly message = input<string | undefined>(undefined);
  readonly type = input<string | undefined>(undefined);
  readonly durationMs = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
