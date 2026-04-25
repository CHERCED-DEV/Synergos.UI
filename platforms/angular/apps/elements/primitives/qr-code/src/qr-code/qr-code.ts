import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynQrCode</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-qr-code',
  standalone: true,
  templateUrl: './qr-code.html',
  styleUrl: './qr-code.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-qr-code' },
})
export class QrCodeElementComponent {
  readonly data = input<string | undefined>(undefined);
  readonly size = input<string | undefined>(undefined);
  readonly ecLevel = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
