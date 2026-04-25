import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynToastCenter</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-toast-center',
  standalone: true,
  templateUrl: './toast-center.html',
  styleUrl: './toast-center.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-toast-center' },
})
export class ToastCenterElementComponent {
  readonly position = input<string | undefined>(undefined);
  readonly maxVisible = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
