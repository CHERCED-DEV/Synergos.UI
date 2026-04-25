import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynOtpInput</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-otp-input',
  standalone: true,
  templateUrl: './otp-input.html',
  styleUrl: './otp-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-otp-input' },
})
export class OtpInputElementComponent {
  readonly label = input<string | undefined>(undefined);
  readonly length = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
