import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynTreeView</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-tree-view',
  standalone: true,
  templateUrl: './tree-view.html',
  styleUrl: './tree-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-tree-view' },
})
export class TreeViewElementComponent {
  readonly treeJson = input<string | undefined>(undefined);
  readonly expandAll = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
