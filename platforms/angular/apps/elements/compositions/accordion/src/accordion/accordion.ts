import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynAccordion</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-accordion',
  standalone: true,
  templateUrl: './accordion.html',
  styleUrl: './accordion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-accordion' },
})
export class AccordionElementComponent {
  readonly itemsJson = input<string | undefined>(undefined);
  readonly allowMultiple = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
