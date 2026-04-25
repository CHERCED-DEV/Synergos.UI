import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynAvatarGroup</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-avatar-group',
  standalone: true,
  templateUrl: './avatar-group.html',
  styleUrl: './avatar-group.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-avatar-group' },
})
export class AvatarGroupElementComponent {
  readonly avatarsJson = input<string | undefined>(undefined);
  readonly maxVisible = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
