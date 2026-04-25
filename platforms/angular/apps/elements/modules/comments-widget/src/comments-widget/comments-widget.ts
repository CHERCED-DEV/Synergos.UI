import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynCommentsWidget</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-comments-widget',
  standalone: true,
  templateUrl: './comments-widget.html',
  styleUrl: './comments-widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-comments-widget' },
})
export class CommentsWidgetElementComponent {
  readonly provider = input<string | undefined>(undefined);
  readonly threadId = input<string | undefined>(undefined);
  readonly configNote = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
