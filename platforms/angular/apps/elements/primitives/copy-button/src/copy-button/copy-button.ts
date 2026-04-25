import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynCopyButton</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-copy-button',
  standalone: true,
  templateUrl: './copy-button.html',
  styleUrl: './copy-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-copy-button' },
})
export class CopyButtonElementComponent {
  readonly copyText = input<string | undefined>(undefined);
  readonly buttonLabel = input<string | undefined>(undefined);
  readonly feedbackLabel = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
