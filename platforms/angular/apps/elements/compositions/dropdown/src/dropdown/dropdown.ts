import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynDropdown</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-dropdown',
  standalone: true,
  templateUrl: './dropdown.html',
  styleUrl: './dropdown.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-dropdown' },
})
export class DropdownElementComponent {
  readonly triggerLabel = input<string | undefined>(undefined);
  readonly optionsJson = input<string | undefined>(undefined);
  readonly selectedValue = input<string | undefined>(undefined);
  readonly searchable = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
