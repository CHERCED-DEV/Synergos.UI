import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynModalTrigger</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-modal-trigger',
  standalone: true,
  templateUrl: './modal-trigger.html',
  styleUrl: './modal-trigger.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-modal-trigger' },
})
export class ModalTriggerElementComponent {
  readonly triggerLabel = input<string | undefined>(undefined);
  readonly modalTitle = input<string | undefined>(undefined);
  readonly modalContent = input<string | undefined>(undefined);
  readonly modalSize = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
