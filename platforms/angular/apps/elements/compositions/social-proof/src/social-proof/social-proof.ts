import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynSocialProof</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-social-proof',
  standalone: true,
  templateUrl: './social-proof.html',
  styleUrl: './social-proof.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-social-proof' },
})
export class SocialProofElementComponent {
  readonly template = input<string | undefined>(undefined);
  readonly dataSource = input<string | undefined>(undefined);
  readonly rotationInterval = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
