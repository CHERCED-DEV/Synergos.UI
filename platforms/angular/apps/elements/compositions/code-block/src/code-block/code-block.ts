import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynCodeBlock</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-code-block',
  standalone: true,
  templateUrl: './code-block.html',
  styleUrl: './code-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-code-block' },
})
export class CodeBlockElementComponent {
  readonly code = input<string | undefined>(undefined);
  readonly language = input<string | undefined>(undefined);
  readonly showLineNumbers = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
