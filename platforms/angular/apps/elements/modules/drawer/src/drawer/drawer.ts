import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynDrawer</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-drawer',
  standalone: true,
  templateUrl: './drawer.html',
  styleUrl: './drawer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-drawer' },
})
export class DrawerElementComponent {
  readonly triggerLabel = input<string | undefined>(undefined);
  readonly drawerContent = input<string | undefined>(undefined);
  readonly side = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
